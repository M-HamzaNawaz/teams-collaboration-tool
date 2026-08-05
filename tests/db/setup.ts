import { beforeAll } from 'vitest'

/**
 * Setup for the `db` test project (M0-04).
 *
 * These tests assert properties enforced by Postgres itself — grants, RLS,
 * triggers — so they require the local Supabase stack (`npm run db:start`).
 *
 * Deliberately does NOT import `@/lib/env/server`: that module is guarded by
 * `server-only`, which throws outside a React server context. Tests read the
 * connection string directly, defaulting to the local stack's fixed values.
 */
export const TEST_DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

export const TEST_SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321'

beforeAll(async () => {
  // Fail fast with a useful message when the stack is down, instead of every
  // test timing out individually.
  try {
    const response = await fetch(`${TEST_SUPABASE_URL}/rest/v1/`, {
      method: 'HEAD',
      signal: AbortSignal.timeout(3000),
    })
    // Any HTTP response (even 401) means the stack is up.
    void response
  } catch {
    throw new Error(
      `Supabase local stack is not reachable at ${TEST_SUPABASE_URL}. ` +
        `Run \`npm run db:start\` before \`npm run test:db\`.`,
    )
  }
})
