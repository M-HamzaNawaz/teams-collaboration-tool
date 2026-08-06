import type { MemberRole, ProfileRow } from '@/lib/types'

/**
 * projectProfile() (M8-02) — the field-level mask. One function; every
 * profile-returning endpoint passes through it (M8-03).
 *
 * Two locks, and this is the second: real contact data (users.email/phone)
 * is unreadable by non-service roles at the GRANT level (M1-08), and this
 * projector cannot leak it because it never receives it — ProfileRow has no
 * such fields, and the output is built by picking from a hard whitelist.
 * A malicious visibility rule like ["email"] selects nothing.
 *
 * Rules come from role_visibility_rules (per workspace, seeded at creation,
 * M3-03/M8-01); when no rule matches, the DEFAULTS below apply — identical
 * to the seeded matrix, so a missing row fails closed to spec behavior.
 */

/** The ONLY fields that can ever cross the wire about another person. */
const PROJECTABLE = ['display_name', 'nickname', 'role_label', 'avatar_url'] as const
type ProjectableField = (typeof PROJECTABLE)[number]

export type VisibilityRule = {
  viewer_role: MemberRole
  target_role: MemberRole
  visible_fields: unknown // jsonb from the db — validated here, not trusted
}

export type MaskedProfile = {
  userId: string
  memberRole: MemberRole
  displayName?: string
  nickname?: string | null
  roleLabel?: string
  avatarUrl?: string | null
}

/** Spec defaults (M8-01): clients see name + role label; team sees more. */
const DEFAULT_FIELDS: Record<MemberRole, Record<MemberRole, ProjectableField[]>> = {
  client: {
    admin: ['display_name', 'role_label', 'avatar_url'],
    member: ['display_name', 'role_label', 'avatar_url'],
    client: ['display_name', 'avatar_url'],
  },
  member: {
    admin: ['display_name', 'nickname', 'role_label', 'avatar_url'],
    member: ['display_name', 'nickname', 'role_label', 'avatar_url'],
    client: ['display_name', 'nickname', 'role_label', 'avatar_url'],
  },
  admin: {
    admin: ['display_name', 'nickname', 'role_label', 'avatar_url'],
    member: ['display_name', 'nickname', 'role_label', 'avatar_url'],
    client: ['display_name', 'nickname', 'role_label', 'avatar_url'],
  },
}

export function projectProfile(
  viewerRole: MemberRole,
  target: ProfileRow,
  rules: VisibilityRule[] = [],
): MaskedProfile {
  const rule = rules.find(
    (r) =>
      r.viewer_role === viewerRole && r.target_role === target.member_role,
  )

  // Validate the jsonb against the whitelist — a rule can NARROW what the
  // defaults show, or reorder it, but can never name a field outside
  // PROJECTABLE into existence.
  const requested = Array.isArray(rule?.visible_fields)
    ? (rule.visible_fields as unknown[]).filter(
        (f): f is ProjectableField =>
          typeof f === 'string' &&
          (PROJECTABLE as readonly string[]).includes(f),
      )
    : DEFAULT_FIELDS[viewerRole][target.member_role]

  const masked: MaskedProfile = {
    userId: target.user_id,
    memberRole: target.member_role,
  }
  for (const field of requested) {
    if (field === 'display_name') masked.displayName = target.display_name
    if (field === 'nickname') masked.nickname = target.nickname
    if (field === 'role_label') masked.roleLabel = target.role_label
    if (field === 'avatar_url') masked.avatarUrl = target.avatar_url
  }
  return masked
}
