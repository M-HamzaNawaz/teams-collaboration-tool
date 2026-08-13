/** Shared row/enum types mirroring the schema (M1). */

export type MemberRole = 'admin' | 'member' | 'client'
export type GroupRole = 'manager' | 'member'
export type GroupStatus = 'active' | 'archived' | 'deleted'
export type MessageStatus = 'pending' | 'delivered' | 'blocked'

export type ProfileRow = {
  user_id: string
  workspace_id: string
  display_name: string
  nickname: string | null
  member_role: MemberRole
  role_label: string
  avatar_url: string | null
  /** Chosen color theme id; null until the first-login picker runs. */
  theme: string | null
  created_at: string
}

export type WorkspaceRow = {
  id: string
  name: string
  owner_id: string
  settings_jsonb: Record<string, unknown>
  created_at: string
}

export type GroupRow = {
  id: string
  workspace_id: string
  name: string
  status: GroupStatus
  created_by: string
  created_at: string
  archived_at: string | null
  deleted_at: string | null
  /** Per-group moderation rules; see lib/groups/settings.ts. */
  settings_jsonb: Record<string, unknown>
}

export type GroupMemberRow = {
  group_id: string
  user_id: string
  workspace_id: string
  group_role: GroupRole
  joined_at: string
  removed_at: string | null
}
