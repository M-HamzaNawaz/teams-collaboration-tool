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
  const [{ data: groups }, { data: workspace }] = await Promise.all([
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
  ])

  return (
    <ChatShell
      groups={(groups ?? []) as GroupRow[]}
      workspaceName={(workspace as WorkspaceRow | null)?.name ?? 'Workspace'}
      me={{
        userId: session.userId,
        displayName: session.profile.display_name,
        roleLabel: session.profile.role_label || session.profile.member_role,
      }}
    />
  )
}
