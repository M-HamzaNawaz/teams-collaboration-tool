import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Session revocation (M3-02) — the concrete answer to the spec's "session
 * invalidated within seconds" criterion. Three layers, in order of effect:
 *
 *  1. RLS: the caller sets group_members.removed_at (or deletes the profile);
 *     every policy denies on the target's NEXT query. This is the instant
 *     data cutoff — their still-valid JWT grants access to nothing.
 *  2. This function: revokes all refresh tokens via a security-definer RPC
 *     (supabase-js admin.signOut needs the target's own JWT, which an admin
 *     removing a member doesn't have — the RPC works by user id).
 *  3. Config: JWTs live 10 minutes (supabase/config.toml), bounding the
 *     window in which the unrenewable token is accepted at all.
 *
 * Callers (member removal, M4-03) should also broadcast `member_removed` so
 * the client's open socket hard-reloads to a logged-out state.
 */
export async function revokeUserSessions(
  db: SupabaseClient,
  userId: string,
): Promise<void> {
  const { error } = await db.rpc('revoke_user_refresh_tokens', {
    p_user_id: userId,
  })
  if (error) {
    throw new Error(`session revocation failed for ${userId}: ${error.message}`)
  }
}
