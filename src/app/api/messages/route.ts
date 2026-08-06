import { z } from 'zod'

import { getSession } from '@/lib/auth/session'
import { createRateLimiter, rateLimitResponse } from '@/lib/auth/rate-limit'
import { authorize } from '@/lib/authz/authorize'
import { detect, type DetectionConfig } from '@/lib/detection'
import { sendEmail } from '@/lib/email/send'
import { publicEnv } from '@/lib/env/public'
import { serviceClient } from '@/lib/supabase/service-client'

/**
 * POST /api/messages (M5-01) — THE write path. The product's core guarantee
 * lives on this route: the browser's role has no INSERT grant on messages
 * (M1-08), so every message that exists came through here, and this route
 * does not insert until detect() has spoken.
 *
 *   authorize(group.write) → detect(body) → send_message() RPC (atomic:
 *   message + flag row + audit) → status back to the sender.
 *
 * The sender learns the STATUS (their "pending review" UI state, M5-05) but
 * never the findings — those would teach a determined sender exactly how to
 * evade the rules. Held messages reach recipients only when an admin flips
 * status to 'delivered' (M6-02); RLS makes that flip the delivery itself.
 */

const bodySchema = z.object({
  groupId: z.uuid(),
  body: z.string().min(1).max(10_000),
})

/** 30 messages per minute per sender — chat-speed, flood-hostile. */
const messageLimiter = createRateLimiter({ windowMs: 60_000, max: 30 })

async function workspaceDetectionConfig(
  service: ReturnType<typeof serviceClient>,
  workspaceId: string,
): Promise<Partial<DetectionConfig> | undefined> {
  const { data } = await service
    .from('workspaces')
    .select('settings_jsonb')
    .eq('id', workspaceId)
    .single()
  const settings = data?.settings_jsonb as
    | { detection?: Partial<DetectionConfig> }
    | null
  return settings?.detection
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }
  const workspaceId = session.profile.workspace_id

  if (!messageLimiter.check(`send:${session.userId}`)) {
    return rateLimitResponse()
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'invalid input' },
      { status: 400 },
    )
  }
  const { groupId, body } = parsed.data

  const service = serviceClient()
  const authz = await authorize(service, session.userId, {
    workspaceId,
    groupId,
    action: 'group.write',
  })
  if (!authz.ok) {
    return Response.json({ error: authz.reason }, { status: authz.status })
  }

  // The line the product stands on.
  const config = await workspaceDetectionConfig(service, workspaceId)
  const verdict = detect(body, config)

  const { data, error } = await service.rpc('send_message', {
    p_workspace_id: workspaceId,
    p_group_id: groupId,
    p_sender_id: session.userId,
    p_sender_display_name: session.profile.display_name,
    p_group_name: authz.group?.name ?? '',
    p_body: body,
    p_action: verdict.action,
    p_findings: verdict.findings,
  })

  if (error) {
    return Response.json({ error: 'send failed' }, { status: 500 })
  }

  const message = data as {
    id: string
    status: 'pending' | 'delivered'
    created_at: string
    delivered_at: string | null
  }

  // Held → nudge admin dashboards now (M6-03 subscribes), and fall back to
  // email when no admin session is active. Both best-effort: the hold
  // itself is already durable in the database.
  if (verdict.action === 'hold') {
    try {
      const channel = service.channel(`workspace:${workspaceId}:moderation`)
      await channel.send({
        type: 'broadcast',
        event: 'message_held',
        payload: { message_id: message.id, group_id: groupId },
      })
      await service.removeChannel(channel)
    } catch {
      // Realtime hiccup — the hold queue query (M6-01) remains the truth.
    }

    void (async () => {
      try {
        const { data: recipients } = await service.rpc(
          'admin_alert_recipients',
          { p_workspace_id: workspaceId },
        )
        const emails = ((recipients ?? []) as Array<{ email: string }>).map(
          (r) => r.email,
        )
        for (const to of emails) {
          await sendEmail({
            to,
            subject: 'A message is waiting for review on Confide',
            text:
              `A message in "${authz.group?.name ?? 'a group'}" was held for review.\n\n` +
              `Open the moderation queue to approve or block it:\n` +
              `${publicEnv.NEXT_PUBLIC_APP_URL}/app/moderation\n\n` +
              `Held messages auto-escalate per your workspace settings.`,
          })
        }
      } catch {
        // Email fallback is advisory; the queue and escalation timers hold.
      }
    })()
  }

  return Response.json(
    {
      message: {
        id: message.id,
        status: message.status,
        createdAt: message.created_at,
        deliveredAt: message.delivered_at,
      },
    },
    { status: 201 },
  )
}
