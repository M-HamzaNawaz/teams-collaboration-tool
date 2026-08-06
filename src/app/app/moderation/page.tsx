import { getSession } from '@/lib/auth/session'
import { serviceClient } from '@/lib/supabase/service-client'

import { ModerationQueue } from './moderation-queue'

/**
 * /app/moderation (M6-01) — the admin's cockpit. Admins always get in;
 * a group manager gets in scoped to their groups (the API enforces the
 * scoping; this gate just keeps plain members out of an empty page).
 */
export default async function ModerationPage() {
  const session = await getSession()
  if (!session) {
    return null // proxy redirects unauthenticated traffic before this
  }

  const isAdmin = session.profile.member_role === 'admin'
  let isManager = false
  if (!isAdmin) {
    const service = serviceClient()
    const { data } = await service
      .from('group_members')
      .select('group_id')
      .eq('workspace_id', session.profile.workspace_id)
      .eq('user_id', session.userId)
      .eq('group_role', 'manager')
      .is('removed_at', null)
      .limit(1)
    isManager = (data ?? []).length > 0
  }

  if (!isAdmin && !isManager) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-muted">
          The moderation queue is for workspace admins and group managers.
        </p>
      </main>
    )
  }

  return (
    <ModerationQueue
      workspaceId={session.profile.workspace_id}
      me={{
        userId: session.userId,
        displayName: session.profile.display_name,
        isAdmin,
      }}
    />
  )
}
