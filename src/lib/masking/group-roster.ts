import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Who can appear as a SENDER in a group: its active members PLUS the
 * workspace admins. Admins may write into (and moderate) any group without
 * holding a membership row, so a roster built from group_members alone
 * left their messages labeled with the 'Member' fallback — permanently,
 * on every surface (bubbles, notifications, reply quotes).
 *
 * Exposing admin identities to group members is consistent with the
 * masking spec: every default visibility rule already lets every role see
 * an admin's display name, and projectProfile still applies on top.
 */
export async function groupRosterIds(
  service: SupabaseClient,
  workspaceId: string,
  groupId: string,
): Promise<string[]> {
  const [{ data: members }, { data: admins }] = await Promise.all([
    service
      .from('group_members')
      .select('user_id')
      .eq('group_id', groupId)
      .is('removed_at', null),
    service
      .from('profiles')
      .select('user_id')
      .eq('workspace_id', workspaceId)
      .eq('member_role', 'admin'),
  ])
  return [
    ...new Set(
      [...(members ?? []), ...(admins ?? [])].map((r) => r.user_id as string),
    ),
  ]
}
