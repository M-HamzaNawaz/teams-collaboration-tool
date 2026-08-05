import { createBrowserClient } from '@supabase/ssr'

import { publicEnv } from '@/lib/env/public'

/**
 * Browser-side Supabase client (M0-07).
 *
 * Runs with the anon key and the user's session cookie, so every query is
 * subject to Row Level Security. This client is READ-ONLY in practice: the
 * `authenticated` role has no INSERT/UPDATE/DELETE grant on `messages` and no
 * UPDATE on `profiles` (M1-08), so all writes go through API routes.
 *
 * Its jobs are reads and the Realtime subscription (M5-02).
 */
export function browserClient() {
  return createBrowserClient(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    publicEnv.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  )
}
