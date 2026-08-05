import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import { publicEnv } from '@/lib/env/public'
import { serverEnv } from '@/lib/env/server'

/**
 * Service-role Supabase client (M0-07).
 *
 * BYPASSES Row Level Security. This is the client that writes messages after
 * `detect()` has run (M5-01) — the ability the browser is denied by grant.
 *
 * Two rules, both load-bearing:
 *
 * 1. `import 'server-only'` at the top makes any import of this module from a
 *    client component a BUILD ERROR. The service-role key must never reach the
 *    browser; a leak would hand any visitor unrestricted access to every
 *    workspace. Guarded by a test (server-only-guard.test.ts).
 *
 * 2. Because RLS is bypassed, AUTHORIZATION IS THIS CALLER'S PROBLEM. Every
 *    route that touches this client must call `authorize()` (M3-06) first.
 *    No exceptions — the API layer is the choke point.
 */
let cached: SupabaseClient | undefined

export function serviceClient(): SupabaseClient {
  cached ??= createClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        // No user session — this is a machine credential.
        persistSession: false,
        autoRefreshToken: false,
      },
    },
  )

  return cached
}
