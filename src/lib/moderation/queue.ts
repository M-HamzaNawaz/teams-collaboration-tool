import type { Session } from '@/lib/auth/session'
import type { Finding } from '@/lib/detection'
import { serviceClient } from '@/lib/supabase/service-client'
import type { GroupRole, MemberRole } from '@/lib/types'

/**
 * The moderation queue, buildable from BOTH the API route and the server
 * page. The page seeds the client with this so /app/moderation paints real
 * cards on arrival — the route-level skeleton is the only loading state,
 * instead of a second client-side shimmer on every visit (the same
 * double-skeleton the chat page had).
 *
 * Admins get every pending message in the workspace; a group MANAGER gets
 * exactly their own groups'. Findings (spans into the ORIGINAL text) ship
 * with each item so the UI can highlight what the sender typed.
 */

export type ModerationQueueItem = {
  id: string
  groupId: string
  groupName: string
  senderId: string
  senderName: string
  body: string
  createdAt: string
  waitingSeconds: number
  findings: Finding[]
  escalated: boolean
}

export type ModerationQueueResult =
  | { ok: true; queue: ModerationQueueItem[] }
  | { ok: false; status: number; error: string }

export async function buildModerationQueue(
  session: Session,
): Promise<ModerationQueueResult> {
  const workspaceId = session.profile.workspace_id
  const isAdmin = (session.profile.member_role as MemberRole) === 'admin'

  const service = serviceClient()

  // Clients never reach the queue — held findings are the exact content
  // holds exist to keep from them (defense in depth; the db trigger
  // already prevents client-manager rows from existing).
  if (session.profile.member_role === 'client') {
    return { ok: false, status: 403, error: 'requires group manager or admin' }
  }

  // Manager scoping: the groups this caller actively manages.
  let managedGroupIds: string[] = []
  if (!isAdmin) {
    const { data: managed } = await service
      .from('group_members')
      .select('group_id, group_role')
      .eq('workspace_id', workspaceId)
      .eq('user_id', session.userId)
      .eq('group_role', 'manager' satisfies GroupRole)
      .is('removed_at', null)
    managedGroupIds = (managed ?? []).map((m) => m.group_id as string)
    if (managedGroupIds.length === 0) {
      return {
        ok: false,
        status: 403,
        error: 'requires group manager or admin',
      }
    }
  }

  let query = service
    .from('messages')
    .select('id, group_id, sender_id, body, created_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(200)
  if (!isAdmin) query = query.in('group_id', managedGroupIds)

  const { data: pending, error } = await query
  if (error) {
    return { ok: false, status: 500, error: 'queue query failed' }
  }

  const messageIds = (pending ?? []).map((m) => m.id as string)
  const groupIds = [...new Set((pending ?? []).map((m) => m.group_id as string))]
  const senderIds = [...new Set((pending ?? []).map((m) => m.sender_id as string))]

  const [{ data: flags }, { data: groups }, { data: profiles }] =
    await Promise.all([
      messageIds.length
        ? service
            .from('message_flags')
            .select('message_id, findings_jsonb, action, escalated_at')
            .in('message_id', messageIds)
        : { data: [] },
      groupIds.length
        ? service.from('groups').select('id, name').in('id', groupIds)
        : { data: [] },
      senderIds.length
        ? service
            .from('profiles')
            .select('user_id, display_name')
            .eq('workspace_id', workspaceId)
            .in('user_id', senderIds)
        : { data: [] },
    ])

  const flagByMessage = new Map(
    (flags ?? []).map((f) => [f.message_id as string, f]),
  )
  const groupName = new Map(
    (groups ?? []).map((g) => [g.id as string, g.name as string]),
  )
  const senderName = new Map(
    (profiles ?? []).map((p) => [p.user_id as string, p.display_name as string]),
  )

  return {
    ok: true,
    queue: (pending ?? []).map((m) => {
      const flag = flagByMessage.get(m.id as string)
      return {
        id: m.id as string,
        groupId: m.group_id as string,
        groupName: groupName.get(m.group_id as string) ?? '',
        senderId: m.sender_id as string,
        senderName: senderName.get(m.sender_id as string) ?? 'Member',
        body: m.body as string,
        createdAt: m.created_at as string,
        waitingSeconds: Math.floor(
          (Date.now() - new Date(m.created_at as string).getTime()) / 1000,
        ),
        findings: (flag?.findings_jsonb ?? []) as Finding[],
        escalated: !!flag?.escalated_at,
      }
    }),
  }
}
