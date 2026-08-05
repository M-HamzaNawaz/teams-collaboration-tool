import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

import { publicEnv } from '@/lib/env/public'

/**
 * Server-side Supabase client acting AS the caller (M0-07).
 *
 * Carries the caller's JWT from the session cookie, so RLS applies exactly as
 * it would in the browser. Use this for all reads in Server Components and
 * route handlers — if a query works here, it works within the caller's actual
 * permissions, which keeps accidental privilege escalation out of read paths.
 *
 * Writes belong to `serviceClient()` + `authorize()` (M3-06), never this.
 *
 * Note: `cookies()` is async in Next 16, hence the awaited factory.
 */
export async function userClient() {
  const cookieStore = await cookies()

  return createServerClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Server Components cannot write cookies. Session refresh happens
            // in the proxy (M3-01), which can — safe to swallow here.
          }
        },
      },
    },
  )
}
