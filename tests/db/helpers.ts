import postgres from 'postgres'

import { TEST_DATABASE_URL } from './setup'

/**
 * DB test helpers (M1-12/13).
 *
 * `asUser` runs a callback inside a transaction impersonating the
 * `authenticated` role with a given user's JWT claims — exactly what
 * PostgREST does per request — so tests exercise the REAL grants and RLS
 * policies, not a simulation of them. `set local` scopes both role and claims
 * to the transaction; nothing leaks between tests.
 */

export const sql = postgres(TEST_DATABASE_URL, {
  max: 1,
  onnotice: () => {},
})

type Tx = postgres.TransactionSql

export async function asUser<T>(
  userId: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return sql.begin(async (tx) => {
    await tx.unsafe(`set local role authenticated`)
    await tx`select set_config('request.jwt.claims',
      ${JSON.stringify({ sub: userId, role: 'authenticated' })}, true)`
    return fn(tx)
  }) as Promise<T>
}

/** Run a callback as the service_role database role (grants apply, RLS bypassed). */
export async function asServiceRole<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  return sql.begin(async (tx) => {
    await tx.unsafe(`set local role service_role`)
    return fn(tx)
  }) as Promise<T>
}

/** Assert an operation fails with insufficient_privilege (42501). */
export async function expectPermissionDenied(
  operation: Promise<unknown>,
): Promise<void> {
  try {
    await operation
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code === '42501') return
    throw new Error(
      `expected permission denied (42501), got: ${String(error)}`,
    )
  }
  throw new Error('expected permission denied (42501), but the operation succeeded')
}

/** All base tables in the public schema — the generated list M1-12 sweeps. */
export async function publicTables(): Promise<string[]> {
  const rows = await sql<Array<{ table_name: string }>>`
    select table_name
    from information_schema.tables
    where table_schema = 'public' and table_type = 'BASE TABLE'
    order by table_name`
  return rows.map((r) => r.table_name)
}

export async function tableColumns(table: string): Promise<string[]> {
  const rows = await sql<Array<{ column_name: string }>>`
    select column_name
    from information_schema.columns
    where table_schema = 'public' and table_name = ${table}`
  return rows.map((r) => r.column_name)
}
