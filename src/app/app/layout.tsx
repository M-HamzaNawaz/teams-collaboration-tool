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
  const isAdmin = session.profile.member_role === 'admin'

  // Every independent lookup goes out AT ONCE — this layout runs on each
  // server-rendered navigation, and serial awaits were paying one database
  // round trip after another for no reason (felt as slow page changes).
  const supabase = await userClient()
  const [
    { data: workspaces },
    { data: managed },
    { count: pendingNames },
    { data: myGroups },
    adminPendingCount,
  ] = await Promise.all([
    // Workspaces this person belongs to — the switcher's options. Multi-
    // workspace is a real scenario (one person, two agencies, a different
    // masked identity in each).
    service
      .from('workspaces')
      .select('id, name')
      .in(
        'id',
        session.profiles.map((p) => p.workspace_id),
      ),
    // Managers get the moderation entry; the queue itself is scoped server
    // side, and clients can never manage (db trigger + authorize).
    session.profile.member_role === 'client'
      ? Promise.resolve({ data: [] as Array<{ group_id: string }> })
      : service
          .from('group_members')
          .select('group_id')
          .eq('workspace_id', session.profile.workspace_id)
          .eq('user_id', session.userId)
          .eq('group_role', 'manager')
          .is('removed_at', null),
    // What's waiting, per role — a quiet dot, never a number.
    isAdmin
      ? service
          .from('name_change_requests')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', session.profile.workspace_id)
          .eq('status', 'pending')
      : Promise.resolve({ count: 0 }),
    // The caller's own groups (RLS-scoped) feed the ⌘K quick switch.
    supabase
      .from('groups')
      .select('id, name')
      .eq('workspace_id', session.profile.workspace_id)
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
    // Admins' held-message count has no dependencies — fetch it in the
    // same round trip. Managers need their group ids first (below).
    isAdmin
      ? service
          .from('messages')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', session.profile.workspace_id)
          .eq('status', 'pending')
          .then(({ count }) => count ?? 0)
      : Promise.resolve(null),
  ])

  const active = (workspaces ?? []).find(
    (w) => w.id === session.profile.workspace_id,
  ) as Pick<WorkspaceRow, 'id' | 'name'> | undefined

  const managedGroupIds = (managed ?? []).map((m) => m.group_id as string)
  const canModerate = isAdmin || managedGroupIds.length > 0

  let pendingModeration = adminPendingCount ?? 0
  if (!isAdmin && managedGroupIds.length > 0) {
    const { count } = await service
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', session.profile.workspace_id)
      .eq('status', 'pending')
      .in('group_id', managedGroupIds)
    pendingModeration = count ?? 0
  }

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
        // The raw stored value (may be empty) — Edit profile prefills from
        // this, so the member_role fallback never gets written back as data.
        rawRoleLabel: session.profile.role_label ?? '',
        // null = never picked a theme → the shell shows the first-run picker.
        theme: session.profile.theme,
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
