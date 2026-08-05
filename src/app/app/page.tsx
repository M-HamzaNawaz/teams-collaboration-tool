import { getSession } from '@/lib/auth/session'
import { userClient } from '@/lib/supabase/user-client'
import type { WorkspaceRow } from '@/lib/types'

import { LogoutButton } from './logout-button'

/**
 * Protected app shell (M3-01). The proxy guarantees an authenticated user;
 * a user with no workspace profile (mid-onboarding edge) gets a plain notice
 * instead of a broken app.
 *
 * The real chat layout replaces this in M5-03 — this page's job is proving
 * the session pipeline end to end.
 */
export default async function AppPage() {
  const session = await getSession()

  if (!session) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <p className="text-neutral-500">
          Your account isn&apos;t part of a workspace yet. Ask your agency
          admin for an invitation.
        </p>
      </main>
    )
  }

  const supabase = await userClient()
  const { data } = await supabase
    .from('workspaces')
    .select('*')
    .eq('id', session.profile.workspace_id)
    .maybeSingle()
  const workspace = data as WorkspaceRow | null

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{workspace?.name ?? 'Workspace'}</h1>
        <LogoutButton />
      </header>
      <section className="rounded-lg border border-neutral-200 p-4 dark:border-neutral-800">
        <p className="text-sm text-neutral-500">Signed in as</p>
        <p className="font-medium">{session.profile.display_name}</p>
        <p className="text-sm text-neutral-500">
          {session.profile.role_label || session.profile.member_role}
        </p>
      </section>
      <p className="text-sm text-neutral-400">
        Groups and chat arrive in the next milestones (M4/M5).
      </p>
    </main>
  )
}
