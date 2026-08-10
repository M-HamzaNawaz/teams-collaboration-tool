import { getSession } from '@/lib/auth/session'
import { userClient } from '@/lib/supabase/user-client'
import type { GroupRow, WorkspaceRow } from '@/lib/types'

import { ChatShell } from './chat-shell'

/**
 * /app (M5-03) — the chat. The server fetches the caller's groups through
 * the USER client, so the sidebar contains exactly what RLS says exists:
 * members get their active groups, nothing else. There is no group
 * directory and no "start a chat" affordance anywhere in this tree (I1).
 */
export default async function AppPage() {
  const session = await getSession()

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-muted">
          Your account isn&apos;t part of a workspace yet. Ask your agency
          admin for an invitation.
        </p>
      </main>
    )
  }

  const supabase = await userClient()
  const [{ data: groups }, { data: workspace }, { data: memberships }] =
    await Promise.all([
      supabase
        .from('groups')
        .select('*')
        .eq('workspace_id', session.profile.workspace_id)
        .eq('status', 'active')
        .order('created_at', { ascending: false }),
      supabase
        .from('workspaces')
        .select('*')
        .eq('id', session.profile.workspace_id)
        .maybeSingle(),
      supabase
        .from('group_members')
        .select('group_id, group_role, last_read_at')
        .eq('user_id', session.userId)
        .is('removed_at', null),
    ])

  const groupRows = (groups ?? []) as GroupRow[]
  const myMemberships = (memberships ?? []) as Array<{
    group_id: string
    group_role: string
    last_read_at: string | null
  }>
  const lastReadByGroup = new Map(
    myMemberships.map((m) => [m.group_id, m.last_read_at]),
  )

  // Unread badges (M6-05): count by delivered_at, not created_at — a
  // held-then-approved message became VISIBLE at approval, so it counts as
  // unread even though it renders back at its original position.
  const unreadByGroup: Record<string, number> = {}
  await Promise.all(
    groupRows.map(async (group) => {
      let query = supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', group.id)
        .eq('status', 'delivered')
        .neq('sender_id', session.userId)
      const lastRead = lastReadByGroup.get(group.id)
      if (lastRead) query = query.gt('delivered_at', lastRead)
      const { count } = await query
      if (count) unreadByGroup[group.id] = count
    }),
  )


  return (
    <ChatShell
      groups={groupRows}
      workspaceName={(workspace as WorkspaceRow | null)?.name ?? 'Workspace'}
      me={{
        userId: session.userId,
        displayName: session.profile.display_name,
        roleLabel: session.profile.role_label || session.profile.member_role,
        // Drives the sidebar's admin-only "+ New group" affordance (I1).
        isAdmin: session.profile.member_role === 'admin',
      }}
      unreadByGroup={unreadByGroup}
    />
  )
}
