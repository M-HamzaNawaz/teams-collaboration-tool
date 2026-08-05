import 'server-only'

import { cache } from 'react'
import { cookies } from 'next/headers'

import { userClient } from '@/lib/supabase/user-client'
import type { ProfileRow } from '@/lib/types'

/**
 * getSession() (M3-01): the caller's identity + active workspace, resolved
 * once per request (React cache) for Server Components and route handlers.
 *
 * Uses auth.getUser() — which VALIDATES the JWT against the auth server —
 * never the cookie-decoded session alone, which a client can forge.
 *
 * Multi-workspace: one person can hold profiles at several agencies (spec
 * multi-tenancy). The active one comes from the `active_workspace` cookie
 * when it names a workspace the user belongs to; otherwise the earliest
 * profile. RLS guarantees the profiles query only ever returns the caller's
 * own rows.
 */

export const ACTIVE_WORKSPACE_COOKIE = 'active_workspace'

export type Session = {
  userId: string
  email: string | null
  /** Profile in the active workspace. */
  profile: ProfileRow
  /** All workspaces this user belongs to (for the switcher). */
  profiles: ProfileRow[]
}

export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await userClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  const profiles = (data ?? []) as ProfileRow[]
  if (profiles.length === 0) return null // authenticated but in no workspace

  const cookieStore = await cookies()
  const requested = cookieStore.get(ACTIVE_WORKSPACE_COOKIE)?.value
  const profile =
    profiles.find((p) => p.workspace_id === requested) ?? profiles[0]

  return {
    userId: user.id,
    email: user.email ?? null,
    profile,
    profiles,
  }
})

/** Route-handler guard: session or a thrown 401 response. */
export async function requireSession(): Promise<Session> {
  const session = await getSession()
  if (!session) {
    throw Response.json({ error: 'authentication required' }, { status: 401 })
  }
  return session
}
