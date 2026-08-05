import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { authorize, type AuthzResult } from '../../src/lib/authz/authorize'
import { SEED, seed } from '../../scripts/seed'
import { sql } from './helpers'
import { TEST_SERVICE_ROLE_KEY, TEST_SUPABASE_URL } from './setup'

/**
 * authorize() matrix (M3-06) — the most security-critical function in the
 * codebase, tested against the REAL seeded database through the same
 * service-role client the API routes use.
 *
 * Seed cast: usman=admin(A), ahmed=member, sarah=manager of Unipile,
 * waleed=client; unipile=active, phoneApp=archived, oldSite=deleted;
 * bilal=admin of workspace B.
 */

let db: SupabaseClient

beforeAll(async () => {
  await seed()
  db = createClient(TEST_SUPABASE_URL, TEST_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
})

afterAll(async () => {
  await sql.end()
})

function expectGranted(result: AuthzResult) {
  expect(result.ok, result.ok ? '' : `denied: ${result.reason}`).toBe(true)
}

function expectDenied(result: AuthzResult, status: 403 | 404) {
  expect(result.ok, 'expected denial but was granted').toBe(false)
  if (!result.ok) expect(result.status).toBe(status)
}

describe('admin (usman)', () => {
  it('creates groups, invites, manages members, moderates anywhere', async () => {
    for (const action of ['group.create', 'invite.create', 'member.add', 'member.remove', 'workspace.manage', 'profile.update', 'name_change.review'] as const) {
      expectGranted(await authorize(db, SEED.users.usman, { workspaceId: SEED.wsA, action }))
    }
    expectGranted(await authorize(db, SEED.users.usman, {
      workspaceId: SEED.wsA, groupId: SEED.groups.unipile, action: 'message.moderate',
    }))
  })

  it('reads archived groups but cannot WRITE into them (I3 binds admins too)', async () => {
    expectGranted(await authorize(db, SEED.users.usman, {
      workspaceId: SEED.wsA, groupId: SEED.groups.phoneApp, action: 'group.read',
    }))
    expectDenied(await authorize(db, SEED.users.usman, {
      workspaceId: SEED.wsA, groupId: SEED.groups.phoneApp, action: 'group.write',
    }), 403)
  })

  it('deletion is two-step: archive first, then delete (spec §8.5)', async () => {
    expectDenied(await authorize(db, SEED.users.usman, {
      workspaceId: SEED.wsA, groupId: SEED.groups.unipile, action: 'group.delete',
    }), 403)
    expectGranted(await authorize(db, SEED.users.usman, {
      workspaceId: SEED.wsA, groupId: SEED.groups.phoneApp, action: 'group.delete',
    }))
    expectDenied(await authorize(db, SEED.users.usman, {
      workspaceId: SEED.wsA, groupId: SEED.groups.phoneApp, action: 'group.archive',
    }), 403) // already archived
  })
})

describe('member (ahmed)', () => {
  it('writes into his active group', async () => {
    expectGranted(await authorize(db, SEED.users.ahmed, {
      workspaceId: SEED.wsA, groupId: SEED.groups.unipile, action: 'group.write',
    }))
  })

  it('cannot take any admin-only action', async () => {
    for (const action of ['group.create', 'invite.create', 'member.add', 'member.remove', 'workspace.manage', 'profile.update', 'name_change.review'] as const) {
      expectDenied(await authorize(db, SEED.users.ahmed, { workspaceId: SEED.wsA, action }), 403)
    }
  })

  it('cannot moderate (not a manager)', async () => {
    expectDenied(await authorize(db, SEED.users.ahmed, {
      workspaceId: SEED.wsA, groupId: SEED.groups.unipile, action: 'message.moderate',
    }), 403)
  })

  it('his archived group reads as not-found (invisible to members, I3)', async () => {
    expectDenied(await authorize(db, SEED.users.ahmed, {
      workspaceId: SEED.wsA, groupId: SEED.groups.phoneApp, action: 'group.read',
    }), 404)
  })
})

describe('manager (sarah, Unipile only)', () => {
  it('moderates her own group', async () => {
    expectGranted(await authorize(db, SEED.users.sarah, {
      workspaceId: SEED.wsA, groupId: SEED.groups.unipile, action: 'message.moderate',
    }))
  })

  it('cannot moderate a group she does not manage', async () => {
    expectDenied(await authorize(db, SEED.users.sarah, {
      workspaceId: SEED.wsA, groupId: SEED.groups.phoneApp, action: 'message.moderate',
    }), 403)
  })

  it('manager is not admin: cannot archive, delete, or invite (spec §5)', async () => {
    expectDenied(await authorize(db, SEED.users.sarah, {
      workspaceId: SEED.wsA, groupId: SEED.groups.unipile, action: 'group.archive',
    }), 403)
    expectDenied(await authorize(db, SEED.users.sarah, { workspaceId: SEED.wsA, action: 'invite.create' }), 403)
  })
})

describe('client (waleed)', () => {
  it('chats in his group like any member', async () => {
    expectGranted(await authorize(db, SEED.users.waleed, {
      workspaceId: SEED.wsA, groupId: SEED.groups.unipile, action: 'group.write',
    }))
    expectGranted(await authorize(db, SEED.users.waleed, {
      workspaceId: SEED.wsA, action: 'workspace.read',
    }))
  })
})

describe('cross-tenant probes (bilal, admin of B)', () => {
  it('workspace A does not exist for him — 404, not 403', async () => {
    expectDenied(await authorize(db, SEED.users.bilal, {
      workspaceId: SEED.wsA, action: 'workspace.read',
    }), 404)
  })

  it("A's group probed through his own workspace id: 404", async () => {
    expectDenied(await authorize(db, SEED.users.bilal, {
      workspaceId: SEED.wsB, groupId: SEED.groups.unipile, action: 'group.read',
    }), 404)
  })

  it('admin of B gets nothing in A even naming A correctly', async () => {
    expectDenied(await authorize(db, SEED.users.bilal, {
      workspaceId: SEED.wsA, groupId: SEED.groups.unipile, action: 'group.write',
    }), 404)
  })
})

describe('edge cases', () => {
  it('nonexistent group: 404', async () => {
    expectDenied(await authorize(db, SEED.users.usman, {
      workspaceId: SEED.wsA,
      groupId: '00000000-0000-4000-8000-0000000000ff',
      action: 'group.read',
    }), 404)
  })

  it('deleted group rejects writes and reads-as-member', async () => {
    expectDenied(await authorize(db, SEED.users.ahmed, {
      workspaceId: SEED.wsA, groupId: SEED.groups.oldSite, action: 'group.write',
    }), 403)
  })
})
