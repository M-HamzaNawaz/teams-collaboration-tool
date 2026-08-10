import { redirect } from 'next/navigation'

import { getSession } from '@/lib/auth/session'
import { serviceClient } from '@/lib/supabase/service-client'
import type { WorkspaceRow } from '@/lib/types'

import { TopBar } from './top-bar'

/**
 * Shell for every /app page: a slim top bar over a flexible content area.
 *
 * The bar is the ONE piece of global chrome — navigation, workspace
 * switching, theme, and identity all live here, so no page invents its own
 * placement (the inconsistency that crept in when each screen carried its
 * own toggle).
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
  // masked identity in each) that until now had no UI at all.
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
          .limit(1)

  const canModerate = isAdmin || (managed ?? []).length > 0

  return (
    <div className="flex h-dvh flex-col">
      <TopBar
        workspaces={(workspaces ?? []) as Array<{ id: string; name: string }>}
        activeWorkspace={{
          id: session.profile.workspace_id,
          name: active?.name ?? 'Workspace',
        }}
        me={{
          userId: session.userId,
          displayName: session.profile.display_name,
          roleLabel:
            session.profile.role_label || session.profile.member_role,
        }}
        canModerate={canModerate}
        isAdmin={isAdmin}
      />
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  )
}
