import { redirect } from 'next/navigation'

import { getSession } from '@/lib/auth/session'
import { serviceClient } from '@/lib/supabase/service-client'
import { userClient } from '@/lib/supabase/user-client'
import type { WorkspaceRow } from '@/lib/types'

import { AppShell } from './shell'

/**
 * Shell for every /app page: icon dock + frosted top bar (JobPulse §3).
 *
 * The shell is the ONE piece of global chrome — navigation, workspace
 * switching, search, theme, and identity all live here, so no page invents
 * its own placement.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await getSession()
  if (!session) redirect('/login')

  const service = serviceClient()

  // Workspaces this person belongs to — the switcher's options. Multi-
  // workspace is a real scenario (one person, two agencies, a different
  // masked identity in each).
  const { data: workspaces } = await service
    .from('workspaces')
    .select('id, name')
    .in(
      'id',
      session.profiles.map((p) => p.workspace_id),
    )

  const active = (workspaces ?? []).find(
    (w) => w.id === session.profile.workspace_id,
  ) as Pick<WorkspaceRow, 'id' | 'name'> | undefined

  const isAdmin = session.profile.member_role === 'admin'

  // Managers get the moderation entry; the queue itself is scoped server
  // side, and clients can never manage (db trigger + authorize).
  const { data: managed } =
    session.profile.member_role === 'client'
      ? { data: [] }
      : await service
          .from('group_members')
          .select('group_id')
          .eq('workspace_id', session.profile.workspace_id)
          .eq('user_id', session.userId)
          .eq('group_role', 'manager')
          .is('removed_at', null)

  const canModerate = isAdmin || (managed ?? []).length > 0

  // What's waiting, per role. Surfaced as a quiet dot rather than a count:
  // the point is "something needs you", and the queue itself does the
  // counting once you're there.
  const { count: pendingNames } = isAdmin
    ? await service
        .from('name_change_requests')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', session.profile.workspace_id)
        .eq('status', 'pending')
    : { count: 0 }

  const managedGroupIds = (managed ?? []).map((m) => m.group_id as string)
  let pendingModeration = 0
  if (canModerate) {
    let query = service
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', session.profile.workspace_id)
      .eq('status', 'pending')
    if (!isAdmin) query = query.in('group_id', managedGroupIds)
    const { count } = await query
    pendingModeration = count ?? 0
  }

  // The caller's own groups (RLS-scoped) feed the ⌘K quick switch.
  const supabase = await userClient()
  const { data: myGroups } = await supabase
    .from('groups')
    .select('id, name')
    .eq('workspace_id', session.profile.workspace_id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  return (
    <AppShell
      workspaces={(workspaces ?? []) as Array<{ id: string; name: string }>}
      activeWorkspace={{
        id: session.profile.workspace_id,
        name: active?.name ?? 'Workspace',
      }}
      me={{
        userId: session.userId,
        displayName: session.profile.display_name,
        roleLabel: session.profile.role_label || session.profile.member_role,
      }}
      canModerate={canModerate}
      isAdmin={isAdmin}
      alerts={{
        moderation: pendingModeration > 0,
        names: (pendingNames ?? 0) > 0,
      }}
      groups={(myGroups ?? []) as Array<{ id: string; name: string }>}
    >
      {children}
    </AppShell>
  )
}
