import { describe, expect, it } from 'vitest'

import type { MemberRole, ProfileRow } from '@/lib/types'

import { projectProfile, type VisibilityRule } from './project'

/**
 * M8-02 acceptance: exhaustive viewer role × target role × field, plus the
 * property the whole feature stands on — no rule configuration can expose
 * anything outside the whitelist, least of all real contact data.
 */

const ROLES: MemberRole[] = ['admin', 'member', 'client']

function profile(role: MemberRole): ProfileRow {
  return {
    user_id: 'u-1',
    workspace_id: 'w-1',
    display_name: 'Nadia K.',
    nickname: 'nads',
    member_role: role,
    role_label: 'Developer',
    avatar_url: null,
    theme: null,
    created_at: '2026-08-06T00:00:00Z',
  }
}

describe('projectProfile defaults (M8-01 matrix)', () => {
  it('a client never sees a nickname, for any target role', () => {
    for (const target of ROLES) {
      const masked = projectProfile('client', profile(target))
      expect(masked.nickname, `client viewing ${target}`).toBeUndefined()
      expect(masked.displayName).toBe('Nadia K.')
    }
  })

  it('team members and admins see nicknames', () => {
    for (const viewer of ['member', 'admin'] as MemberRole[]) {
      for (const target of ROLES) {
        expect(projectProfile(viewer, profile(target)).nickname).toBe('nads')
      }
    }
  })

  it('clients viewing clients see name only, no role label', () => {
    const masked = projectProfile('client', profile('client'))
    expect(masked.displayName).toBe('Nadia K.')
    expect(masked.roleLabel).toBeUndefined()
  })

  it('every combination exposes AT MOST the whitelist', () => {
    for (const viewer of ROLES) {
      for (const target of ROLES) {
        const keys = Object.keys(projectProfile(viewer, profile(target)))
        for (const key of keys) {
          expect([
            'userId',
            'memberRole',
            'displayName',
            'nickname',
            'roleLabel',
            'avatarUrl',
          ]).toContain(key)
        }
      }
    }
  })
})

describe('rule handling', () => {
  it('a rule can narrow the defaults', () => {
    const rules: VisibilityRule[] = [
      { viewer_role: 'member', target_role: 'member', visible_fields: ['display_name'] },
    ]
    const masked = projectProfile('member', profile('member'), rules)
    expect(masked.displayName).toBe('Nadia K.')
    expect(masked.nickname).toBeUndefined()
    expect(masked.roleLabel).toBeUndefined()
  })

  it('a MALICIOUS rule cannot expose fields outside the whitelist', () => {
    const rules: VisibilityRule[] = [
      {
        viewer_role: 'client',
        target_role: 'member',
        visible_fields: ['email', 'phone', 'user_id; drop table users', 'display_name'],
      },
    ]
    const masked = projectProfile('client', profile('member'), rules)
    expect(JSON.stringify(masked)).not.toContain('email')
    expect(JSON.stringify(masked)).not.toContain('phone')
    expect(masked.displayName).toBe('Nadia K.') // the one legal field survives
  })

  it('garbage jsonb falls back to the defaults (fails closed to spec)', () => {
    const rules: VisibilityRule[] = [
      { viewer_role: 'client', target_role: 'member', visible_fields: 'everything' },
    ]
    const masked = projectProfile('client', profile('member'), rules)
    expect(masked.nickname).toBeUndefined()
    expect(masked.displayName).toBe('Nadia K.')
  })

  it('the projector CANNOT leak contact data — it never receives it', () => {
    // Even a hostile caller stuffing extra keys into the row: the output is
    // BUILT by picking named fields, never by spreading the input.
    const poisoned = {
      ...profile('member'),
      email: 'real@secret.com',
      phone: '+92300',
    } as ProfileRow
    const masked = projectProfile('admin', poisoned, [])
    expect(JSON.stringify(masked)).not.toContain('secret.com')
    expect(JSON.stringify(masked)).not.toContain('+92300')
  })
})
