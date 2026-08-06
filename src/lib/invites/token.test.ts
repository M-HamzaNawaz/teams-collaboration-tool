import { describe, expect, it } from 'vitest'

import {
  generateInviteToken,
  hashInviteToken,
  INVITE_TTL_MS,
  inviteExpiry,
} from './token'

describe('invite tokens (M4-04)', () => {
  it('generates 32 bytes of base64url with no padding', () => {
    const token = generateInviteToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/) // 32 bytes → 43 base64url chars
  })

  it('never generates the same token twice', () => {
    const seen = new Set(Array.from({ length: 1000 }, generateInviteToken))
    expect(seen.size).toBe(1000)
  })

  it('hashes deterministically to SHA-256 hex', () => {
    // Known vector: sha256("test-token")
    expect(hashInviteToken('test-token')).toBe(
      '4c5dc9b7708905f77f5e5d16316b5dfb425e68cb326dcd55a860e90a7707031e',
    )
    expect(hashInviteToken('test-token')).toBe(hashInviteToken('test-token'))
    expect(hashInviteToken('a')).not.toBe(hashInviteToken('b'))
  })

  it('expiry is exactly 7 days out', () => {
    const now = new Date('2026-08-06T12:00:00.000Z')
    expect(inviteExpiry(now)).toBe('2026-08-13T12:00:00.000Z')
    expect(INVITE_TTL_MS).toBe(604_800_000)
  })
})
