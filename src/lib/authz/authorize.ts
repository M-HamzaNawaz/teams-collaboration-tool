import type { SupabaseClient } from '@supabase/supabase-js'

import type { GroupRole, GroupRow, MemberRole, ProfileRow } from '@/lib/types'

/**
 * authorize() — the single authorization choke point (M3-06).
 *
 * Writes go through serviceClient(), which BYPASSES RLS — so the API layer
 * owns authorization, and this function is where it lives. Every mutation
 * route calls it before touching the database. It is the most
 * security-critical function in the codebase; its test suite covers the full
 * role × action × group-state matrix (tests/db/authorize.db.test.ts).
 *
 * The client is injected rather than imported so the db test suite can call
 * it with its own service connection; routes pass serviceClient().
 *
 * Denial semantics: cross-tenant probes and non-membership return 404 (the
 * resource's existence is itself confidential); real permission shortfalls
 * within a workspace return 403.
 */

export type AuthzAction =
  | 'workspace.read'
  | 'workspace.manage' // settings, visibility rules, detection config
  | 'group.create'
  | 'group.read'
  | 'group.write' // send messages, upload files
  | 'group.archive'
  | 'group.delete'
  | 'member.add'
  | 'member.remove'
  | 'invite.create'
  | 'message.moderate' // approve/block held messages
  | 'profile.update' // display names, avatars — I2: admin-only
  | 'name_change.review'

export type AuthzTarget = {
  workspaceId: string
  groupId?: string
  action: AuthzAction
}

export type AuthzGrant = {
  ok: true
  role: MemberRole
  groupRole: GroupRole | null
  group: GroupRow | null
}

export type AuthzDenial = {
  ok: false
  status: 403 | 404
  reason: string
}

export type AuthzResult = AuthzGrant | AuthzDenial

/** Actions only a workspace admin may take, regardless of group context. */
const ADMIN_ONLY: ReadonlySet<AuthzAction> = new Set<AuthzAction>([
  'workspace.manage',
  'group.create',
  'group.archive',
  'group.delete',
  'member.add',
  'member.remove',
  'invite.create',
  'profile.update',
  'name_change.review',
])

/** Actions that write into a group — I3: these require the group be ACTIVE. */
const GROUP_WRITE: ReadonlySet<AuthzAction> = new Set<AuthzAction>([
  'group.write',
])

export async function authorize(
  db: SupabaseClient,
  userId: string,
  target: AuthzTarget,
): Promise<AuthzResult> {
  const { workspaceId, groupId, action } = target

  // 1. Workspace membership — everything starts here.
  const { data: profileData } = await db
    .from('profiles')
    .select('member_role')
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  const profile = profileData as Pick<ProfileRow, 'member_role'> | null
  if (!profile) {
    return { ok: false, status: 404, reason: 'not a workspace member' }
  }
  const role = profile.member_role
  const isAdmin = role === 'admin'

  // 2. Admin-only actions.
  if (ADMIN_ONLY.has(action) && !isAdmin) {
    return { ok: false, status: 403, reason: `${action} requires workspace admin` }
  }

  // 3. Resolve the group when the action targets one.
  let group: GroupRow | null = null
  let groupRole: GroupRole | null = null

  if (groupId) {
    const { data: groupData } = await db
      .from('groups')
      .select('*')
      .eq('id', groupId)
      .maybeSingle()

    group = groupData as GroupRow | null
    // Cross-tenant probe: a group outside the caller's workspace does not
    // exist as far as they can tell.
    if (!group || group.workspace_id !== workspaceId) {
      return { ok: false, status: 404, reason: 'group not found' }
    }

    const { data: memberData } = await db
      .from('group_members')
      .select('group_role, removed_at')
      .eq('group_id', groupId)
      .eq('user_id', userId)
      .maybeSingle()

    const membership = memberData as
      | { group_role: GroupRole; removed_at: string | null }
      | null
    groupRole = membership && membership.removed_at === null
      ? membership.group_role
      : null
  }

  // 4. Group-state rules (I3): nothing writes into a non-active group, ever —
  // not even the admin. Archived is read-only by definition.
  if (group && GROUP_WRITE.has(action) && group.status !== 'active') {
    return {
      ok: false,
      status: 403,
      reason: `group is ${group.status} and read-only (I3)`,
    }
  }

  switch (action) {
    case 'workspace.read':
      return grant()

    case 'workspace.manage':
    case 'group.create':
    case 'member.add':
    case 'member.remove':
    case 'invite.create':
    case 'profile.update':
    case 'name_change.review':
      return grant() // admin verified in step 2

    case 'group.read': {
      if (!group) return { ok: false, status: 404, reason: 'group required' }
      if (isAdmin) return grant() // admin sees every state, incl. archived
      if (group.status === 'active' && groupRole !== null) return grant()
      return { ok: false, status: 404, reason: 'group not found' }
    }

    case 'group.write': {
      if (!group) return { ok: false, status: 404, reason: 'group required' }
      if (isAdmin) return grant()
      if (groupRole !== null) return grant() // group is active per step 4
      return { ok: false, status: 403, reason: 'not a group member' }
    }

    case 'group.archive': {
      if (!group) return { ok: false, status: 404, reason: 'group required' }
      if (group.status !== 'active') {
        return { ok: false, status: 403, reason: 'only active groups archive' }
      }
      return grant()
    }

    case 'group.delete': {
      if (!group) return { ok: false, status: 404, reason: 'group required' }
      // Two-step deletion (spec §8.5): archive first, then a separate
      // explicit delete. Never straight from active.
      if (group.status !== 'archived') {
        return {
          ok: false,
          status: 403,
          reason: 'permanent deletion requires the group be archived first',
        }
      }
      return grant()
    }

    case 'message.moderate': {
      if (isAdmin) return grant() // admin moderates everywhere
      if (!group) return { ok: false, status: 404, reason: 'group required' }
      // One Manager per group: that group's manager approves/blocks for
      // their group only (spec Q5). NEVER a client, even if a manager row
      // somehow exists (the db trigger forbids creating one): the queue
      // shows held findings — the exact data holds keep from clients.
      if (groupRole === 'manager' && role !== 'client') return grant()
      return { ok: false, status: 403, reason: 'requires group manager or admin' }
    }
  }

  function grant(): AuthzGrant {
    return { ok: true, role, groupRole, group }
  }
}
