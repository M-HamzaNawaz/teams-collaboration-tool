import { createHash, randomBytes } from 'node:crypto'

/**
 * Invitation tokens (M4-04).
 *
 * The raw token exists in exactly two places, ever: the email we send, and
 * the URL the invitee clicks. The database stores only SHA-256(token) —
 * a leaked invitations table cannot be turned into working invite links.
 *
 * 32 random bytes, base64url — 256 bits of entropy, URL-safe, no padding.
 */

export function generateInviteToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashInviteToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex')
}

/** Invitations live 7 days (spec §6). */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export function inviteExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + INVITE_TTL_MS).toISOString()
}
