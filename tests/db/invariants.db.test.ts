import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SEED, seed } from '../../scripts/seed'
import {
  asServiceRole,
  asUser,
  expectPermissionDenied,
  sql,
  tableColumns,
} from './helpers'

/**
 * Invariant suite (M1-13): direct tests of the three invariants. Each failure
 * message names the invariant it broke.
 */

beforeAll(async () => {
  await seed()
})

afterAll(async () => {
  await sql.end()
})

describe('I1 — no DMs, groups only', () => {
  it('the messages schema cannot represent a private message', async () => {
    const columns = await tableColumns('messages')
    for (const forbidden of ['recipient_id', 'conversation_id', 'dm_id', 'to_user_id']) {
      expect(columns, `I1 violated: messages.${forbidden} exists`).not.toContain(forbidden)
    }
    const [row] = await sql<Array<{ is_nullable: string }>>`
      select is_nullable from information_schema.columns
      where table_schema = 'public' and table_name = 'messages' and column_name = 'group_id'`
    expect(row.is_nullable, 'I1 violated: messages.group_id is nullable').toBe('NO')
  })

  it('a member cannot create a group (only the API can, behind authorize())', async () => {
    // expectPermissionDenied wraps the WHOLE transaction: postgres.js rejects
    // begin() when any query inside errors, even one caught in the callback.
    await expectPermissionDenied(
      asUser(SEED.users.ahmed, (tx) => tx`
        insert into public.groups (workspace_id, name, created_by)
        values (${SEED.wsA}, 'side channel', ${SEED.users.ahmed})`),
    )
  })
})

describe('I2 — identity is admin-controlled', () => {
  it('a member cannot update their own profile row', async () => {
    await expectPermissionDenied(
      asUser(SEED.users.ahmed, (tx) => tx`
        update public.profiles
        set display_name = 'Ahmed — ahmed.dev@gmail.com'
        where user_id = ${SEED.users.ahmed} and workspace_id = ${SEED.wsA}`),
    )
  })

  it('a member cannot read real contact data (users table)', async () => {
    await expectPermissionDenied(
      asUser(SEED.users.waleed, (tx) =>
        tx`select email from public.users where id = ${SEED.users.ahmed}`),
    )
  })

  it('profiles are unreadable by the browser role entirely (M8-03)', async () => {
    // Field-level masking is server-side (projectProfile, M8-02); like
    // `users`, the guarantee is the ABSENCE of a grant. Row scoping — "you
    // can enumerate exactly the people in your own groups" — now lives in
    // GET /api/groups/:id/profiles behind authorize().
    await expectPermissionDenied(
      asUser(SEED.users.waleed, (tx) =>
        tx`select user_id from public.profiles where workspace_id = ${SEED.wsA}`),
    )
    // Even the workspace ADMIN reads profiles through the API only.
    await expectPermissionDenied(
      asUser(SEED.users.usman, (tx) => tx`select * from public.profiles limit 1`),
    )
  })
})

describe('I3 — archive ≠ delete; the audit log is permanent', () => {
  it('archived groups are invisible to members but visible to the admin', async () => {
    await asUser(SEED.users.waleed, async (tx) => {
      // Assert the invariant, not an exact list (the dev db accrues real
      // groups): waleed sees his active group; the archived and tombstone
      // groups do NOT exist for him.
      const groups = await tx<Array<{ id: string }>>`select id from public.groups`
      const ids = groups.map((g) => g.id)
      expect(ids).toContain(SEED.groups.unipile)
      expect(ids).not.toContain(SEED.groups.phoneApp)
      expect(ids).not.toContain(SEED.groups.oldSite)
    })
    await asUser(SEED.users.usman, async (tx) => {
      // Anchored on the seeded ids, not a global count — the local db doubles
      // as the dev database, so rows created by real app usage must not fail
      // the invariant. What matters: ALL THREE states are visible to admin.
      const groups = await tx<Array<{ id: string }>>`
        select id from public.groups
        where id in (${SEED.groups.unipile}, ${SEED.groups.phoneApp}, ${SEED.groups.oldSite})`
      expect(
        groups.map((g) => g.id).sort(),
        'admin must see active + archived + tombstone',
      ).toEqual(
        [SEED.groups.unipile, SEED.groups.phoneApp, SEED.groups.oldSite].sort(),
      )
    })
  })

  it('messages in an archived group are invisible to its members', async () => {
    await asUser(SEED.users.waleed, async (tx) => {
      const rows = await tx`select 1 from public.messages where id = ${SEED.messages.archivedMsg}`
      expect(rows.length).toBe(0)
    })
  })

  it('audit_log rejects UPDATE and DELETE from a superuser connection (trigger)', async () => {
    await expect(
      sql`update public.audit_log set event_type = 'tampered' where workspace_id = ${SEED.wsA}`,
    ).rejects.toThrow(/append-only/)
    await expect(
      sql`delete from public.audit_log where workspace_id = ${SEED.wsA}`,
    ).rejects.toThrow(/append-only/)
  })

  it('audit_log rejects UPDATE and DELETE from service_role (grants)', async () => {
    await expectPermissionDenied(
      asServiceRole((tx) =>
        tx`update public.audit_log set event_type = 'tampered' where false`,
      ),
    )
    await expectPermissionDenied(
      asServiceRole((tx) => tx`delete from public.audit_log where false`),
    )
  })

  it('audit entries have no FK dependence on groups or users (denormalized)', async () => {
    const fks = await sql<Array<{ constraint_name: string }>>`
      select constraint_name from information_schema.table_constraints
      where table_schema = 'public' and table_name = 'audit_log'
        and constraint_type = 'FOREIGN KEY'`
    expect(fks, 'audit_log must survive deletion of everything it references').toEqual([])
  })
})

describe('message visibility — the held-message contract (spec §6/§7)', () => {
  it('the sender sees their own pending message ("pending review", never silently gone)', async () => {
    await asUser(SEED.users.ahmed, async (tx) => {
      const rows = await tx<Array<{ status: string }>>`
        select status from public.messages where id = ${SEED.messages.pending}`
      expect(rows).toEqual([{ status: 'pending' }])
    })
  })

  it('recipients do NOT see the held message', async () => {
    await asUser(SEED.users.waleed, async (tx) => {
      const rows = await tx`select 1 from public.messages where id = ${SEED.messages.pending}`
      expect(rows.length, 'held message leaked to a recipient before approval').toBe(0)
    })
  })

  it('recipients see delivered messages in their active groups', async () => {
    await asUser(SEED.users.waleed, async (tx) => {
      const rows = await tx`select 1 from public.messages where id = ${SEED.messages.delivered}`
      expect(rows.length).toBe(1)
    })
  })

  it('the workspace admin sees the full hold queue', async () => {
    await asUser(SEED.users.usman, async (tx) => {
      const rows = await tx<Array<{ id: string }>>`
        select id from public.messages
        where workspace_id = ${SEED.wsA} and status = 'pending'`
      expect(rows.map((r) => r.id)).toContain(SEED.messages.pending)
    })
  })

  it('"one manager per group" is enforced by the database, not code', async () => {
    await expect(
      sql`insert into public.group_members (group_id, user_id, workspace_id, group_role)
          values (${SEED.groups.unipile}, ${SEED.users.usman}, ${SEED.wsA}, 'manager')`,
    ).rejects.toThrow(/one_manager_per_group|duplicate key/)
  })
})

describe('audit hash chain (M1-07)', () => {
  it('verifies clean on seeded data, for both workspaces', async () => {
    for (const ws of [SEED.wsA, SEED.wsB]) {
      const [result] = await sql<Array<{ ok: boolean; first_bad_id: string | null }>>`
        select * from public.verify_audit_chain(${ws})`
      expect(result.ok, `chain broken in workspace ${ws}`).toBe(true)
    }
  })

  it('detects tampering at the exact row (triggers deliberately disabled)', async () => {
    const [target] = await sql<Array<{ id: string; event_type: string }>>`
      select id, event_type from public.audit_log
      where workspace_id = ${SEED.wsA} order by id limit 1`

    await sql.unsafe(`alter table public.audit_log disable trigger audit_log_no_mutate`)
    try {
      await sql`update public.audit_log set event_type = 'tampered' where id = ${target.id}`

      const [verdict] = await sql<Array<{ ok: boolean; first_bad_id: string }>>`
        select * from public.verify_audit_chain(${SEED.wsA})`
      expect(verdict.ok).toBe(false)
      expect(String(verdict.first_bad_id)).toBe(String(target.id))
    } finally {
      // restore the original value and the trigger
      await sql`update public.audit_log set event_type = ${target.event_type} where id = ${target.id}`
      await sql.unsafe(`alter table public.audit_log enable trigger audit_log_no_mutate`)
    }

    const [restored] = await sql<Array<{ ok: boolean }>>`
      select * from public.verify_audit_chain(${SEED.wsA})`
    expect(restored.ok).toBe(true)
  })
})
