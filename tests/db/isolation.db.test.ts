import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SEED, seed } from '../../scripts/seed'
import {
  asUser,
  expectPermissionDenied,
  publicTables,
  sql,
  tableColumns,
} from './helpers'

/**
 * Cross-tenant isolation harness (M1-12).
 *
 * The spec calls a cross-workspace leak "company-ending"; this suite is the
 * test that backs the claim. The table list is GENERATED from
 * information_schema at run time — a new table ships with isolation coverage
 * or fails CI, no hand-maintained list to forget.
 *
 * For every public table, as a workspace-B user (bilal, admin of B):
 *   read  — workspace-A rows are invisible (0 rows) or the table is
 *           entirely unreadable (42501)
 *   write — denied outright (42501): browser roles hold no write grants
 */

// Tables without a workspace_id column, each with an explicit reason.
const WORKSPACE_ID_EXEMPT: Record<string, string> = {
  workspaces: 'is the tenant boundary itself (isolated by id)',
  users: 'global identity; unreadable by authenticated entirely',
}

let tables: string[] = []

beforeAll(async () => {
  await seed()
  tables = await publicTables()
})

afterAll(async () => {
  await sql.end()
})

describe('schema shape: tenancy is structural', () => {
  it('every table carries workspace_id (or is explicitly exempt)', async () => {
    for (const table of tables) {
      if (table in WORKSPACE_ID_EXEMPT) continue
      const columns = await tableColumns(table)
      expect(
        columns,
        `table "${table}" has no workspace_id and is not in the exempt list — ` +
          `add the column or document the exemption in this test`,
      ).toContain('workspace_id')
    }
  })

  it('browser roles hold zero write grants on any table', async () => {
    const grants = await sql<Array<{ table_name: string; privilege_type: string; grantee: string }>>`
      select table_name, privilege_type, grantee
      from information_schema.role_table_grants
      where table_schema = 'public'
        and grantee in ('anon', 'authenticated')
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')`
    expect(
      grants.map((g) => `${g.grantee}:${g.privilege_type}:${g.table_name}`),
      'M1-08 lockdown violated — a browser role can write a table',
    ).toEqual([])
  })

  it('service_role cannot update, delete, or truncate audit_log (I3)', async () => {
    const grants = await sql<Array<{ privilege_type: string }>>`
      select privilege_type
      from information_schema.role_table_grants
      where table_schema = 'public'
        and table_name = 'audit_log'
        and grantee = 'service_role'
        and privilege_type in ('UPDATE', 'DELETE', 'TRUNCATE')`
    expect(grants).toEqual([])
  })
})

describe('cross-tenant reads: workspace B sees nothing of workspace A', () => {
  it('sweeps every workspace_id table as a B user', async () => {
    for (const table of tables) {
      if (table in WORKSPACE_ID_EXEMPT) continue

      // The catch sits OUTSIDE asUser: postgres.js rejects the whole begin()
      // when any query inside errors, even a caught one — a denial must
      // surface at the transaction level, not be handled within it.
      let rows: unknown[]
      try {
        rows = await asUser(SEED.users.bilal, (tx) =>
          tx.unsafe(
            `select 1 from public."${table}" where workspace_id = '${SEED.wsA}' limit 5`,
          ),
        )
      } catch (error) {
        // Entirely unreadable is also a pass (users, invitations, audit_log…)
        const code = (error as { code?: string }).code
        if (code === '42501') continue
        throw error
      }
      expect(
        rows.length,
        `cross-tenant leak: table "${table}" showed workspace-A rows to a workspace-B user`,
      ).toBe(0)
    }
  })

  it('workspaces: B cannot see workspace A itself', async () => {
    await asUser(SEED.users.bilal, async (tx) => {
      const rows = await tx`select 1 from public.workspaces where id = ${SEED.wsA}`
      expect(rows.length).toBe(0)
    })
  })

  it('users: unreadable by any authenticated user (real contact data)', async () => {
    await expectPermissionDenied(
      asUser(SEED.users.bilal, (tx) => tx`select * from public.users limit 1`),
    )
    // Even a workspace ADMIN reads real contact data via the API only.
    await expectPermissionDenied(
      asUser(SEED.users.usman, (tx) => tx`select * from public.users limit 1`),
    )
  })

  it('B admin cannot see A profiles, groups, or messages by direct id', async () => {
    await asUser(SEED.users.bilal, async (tx) => {
      const profiles = await tx`select 1 from public.profiles where workspace_id = ${SEED.wsA}`
      const groups = await tx`select 1 from public.groups where id = ${SEED.groups.unipile}`
      const messages = await tx`select 1 from public.messages where id = ${SEED.messages.delivered}`
      expect([profiles.length, groups.length, messages.length]).toEqual([0, 0, 0])
    })
  })
})

describe('cross-tenant writes: denied at the grant layer', () => {
  it('sweeps UPDATE and DELETE on every table as a B user', async () => {
    for (const table of tables) {
      const columns = await tableColumns(table)
      const anchor = columns.includes('workspace_id') ? 'workspace_id' : columns[0]

      await expectPermissionDenied(
        asUser(SEED.users.bilal, (tx) =>
          tx.unsafe(`update public."${table}" set "${anchor}" = "${anchor}" where false`),
        ),
      )
      await expectPermissionDenied(
        asUser(SEED.users.bilal, (tx) =>
          tx.unsafe(`delete from public."${table}" where false`),
        ),
      )
    }
  })

  it('a member cannot INSERT a message even into their OWN group (write path, M5-01)', async () => {
    await expectPermissionDenied(
      asUser(SEED.users.ahmed, (tx) => tx`
        insert into public.messages (workspace_id, group_id, sender_id, body, status)
        values (${SEED.wsA}, ${SEED.groups.unipile}, ${SEED.users.ahmed}, 'bypass attempt', 'delivered')`),
    )
  })
})
