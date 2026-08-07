import { getSession } from '@/lib/auth/session'
import { serviceClient } from '@/lib/supabase/service-client'
import type { GroupRole, MemberRole } from '@/lib/types'

/**
 * GET /api/moderation/queue (M6-01).
 *
 * Admins get every pending message in the workspace; a group MANAGER gets
 * exactly their own groups' — the scoping the acceptance test checks. The
 * findings (spans into the ORIGINAL text, M2-02) ship with each item so the
 * UI can highlight precisely what the sender typed.
 *
 * This is a moderator surface: it returns held content and detection
 * findings — the one audience findings are FOR.
 */
export async function GET() {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }
  const workspaceId = session.profile.workspace_id
  const isAdmin = (session.profile.member_role as MemberRole) === 'admin'

  const service = serviceClient()

  // Clients never reach the queue — held findings are the exact content
  // holds exist to keep from them (defense in depth; the db trigger
  // already prevents client-manager rows from existing).
  if (session.profile.member_role === 'client') {
    return Response.json(
      { error: 'requires group manager or admin' },
      { status: 403 },
    )
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
      return Response.json(
        { error: 'requires group manager or admin' },
        { status: 403 },
      )
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
    return Response.json({ error: 'queue query failed' }, { status: 500 })
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
  const groupName = new Map((groups ?? []).map((g) => [g.id as string, g.name as string]))
  const senderName = new Map(
    (profiles ?? []).map((p) => [p.user_id as string, p.display_name as string]),
  )

  return Response.json({
    queue: (pending ?? []).map((m) => {
      const flag = flagByMessage.get(m.id as string)
      return {
        id: m.id,
        groupId: m.group_id,
        groupName: groupName.get(m.group_id as string) ?? '',
        senderId: m.sender_id,
        senderName: senderName.get(m.sender_id as string) ?? 'Member',
        body: m.body,
        createdAt: m.created_at,
        waitingSeconds: Math.floor(
          (Date.now() - new Date(m.created_at as string).getTime()) / 1000,
        ),
        findings: flag?.findings_jsonb ?? [],
        escalated: !!flag?.escalated_at,
      }
    }),
  })
}
