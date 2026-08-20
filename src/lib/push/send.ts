import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'

import { serverEnv } from '@/lib/env/server'
import { publicEnv } from '@/lib/env/public'
import { logError } from '@/lib/log'

/**
 * Web push fanout (Tier 2) — notifications that reach a minimized or fully
 * closed browser, via the browser vendors' push services (free, VAPID).
 *
 * Called on the two paths where a message becomes DELIVERED: the send route
 * (allow/flag_only verdicts) and the moderation approve route. Held
 * messages never reach here — the product rule survives by construction.
 *
 * Payloads are end-to-end encrypted by the push protocol (the push service
 * cannot read them), and recipients get the MASKED sender name — the same
 * projection every other surface shows. Expired subscriptions (404/410)
 * are pruned as they surface. Everything is best-effort: a push failure
 * must never fail message delivery, which realtime already handled.
 */

const configured = Boolean(
  serverEnv.VAPID_PRIVATE_KEY && publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
)

if (configured) {
  webpush.setVapidDetails(
    'mailto:noreply@algotix.ai',
    publicEnv.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    serverEnv.VAPID_PRIVATE_KEY!,
  )
}

export async function sendGroupMessagePush(
  service: SupabaseClient,
  args: {
    workspaceId: string
    groupId: string
    messageId: string
    senderId: string
    body: string
  },
): Promise<void> {
  if (!configured) return

  try {
    const [{ data: group }, { data: members }, { data: sender }] =
      await Promise.all([
        service
          .from('groups')
          .select('name')
          .eq('id', args.groupId)
          .maybeSingle(),
        service
          .from('group_members')
          .select('user_id')
          .eq('group_id', args.groupId)
          .is('removed_at', null),
        service
          .from('profiles')
          .select('display_name')
          .eq('workspace_id', args.workspaceId)
          .eq('user_id', args.senderId)
          .maybeSingle(),
      ])

    const recipientIds = (members ?? [])
      .map((m) => m.user_id as string)
      .filter((id) => id !== args.senderId)
    if (recipientIds.length === 0) return

    const { data: subscriptions } = await service
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('workspace_id', args.workspaceId)
      .in('user_id', recipientIds)
    if (!subscriptions?.length) return

    const groupName = (group?.name as string) ?? 'Confide'
    const senderName = (sender?.display_name as string) ?? 'Member'
    const payload = JSON.stringify({
      title: `${senderName} · ${groupName}`,
      body: args.body.slice(0, 140),
      groupId: args.groupId,
      tag: args.groupId, // collapse a burst from one group into one banner
    })

    await Promise.all(
      subscriptions.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint as string,
              keys: {
                p256dh: sub.p256dh as string,
                auth: sub.auth as string,
              },
            },
            payload,
            { TTL: 3600 },
          )
        } catch (error) {
          const status = (error as { statusCode?: number }).statusCode
          if (status === 404 || status === 410) {
            // The browser dropped this subscription — prune it.
            await service
              .from('push_subscriptions')
              .delete()
              .eq('endpoint', sub.endpoint as string)
          }
        }
      }),
    )
  } catch (error) {
    // ids only — never the body (M10-04 log hygiene).
    logError('push.fanout_failed', error, {
      group_id: args.groupId,
      message_id: args.messageId,
    })
  }
}
