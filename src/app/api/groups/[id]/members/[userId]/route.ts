import { z } from 'zod'

import { audit } from '@/lib/audit/audit'
import { revokeUserSessions } from '@/lib/auth/revoke'
import { getSession } from '@/lib/auth/session'
import { authorize } from '@/lib/authz/authorize'
import { serviceClient } from '@/lib/supabase/service-client'

/**
 * DELETE /api/groups/:id/members/:userId (M4-03) — remove a member.
 *
 * "Removed within seconds" (spec §5.3) is three layers, in order of effect:
 *   1. removed_at set here → every RLS policy denies on their next query.
 *   2. revokeUserSessions() → their refresh token dies; the JWT cannot be
 *      renewed past its 10-minute life.
 *   3. member_removed broadcast → an open socket hard-reloads the client
 *      out of the group immediately (subscriber lands in M5-02).
 *
 * The row is UPDATED, never deleted — membership history is part of the
 * group's tombstone story (I3), and the one-manager index only counts rows
 * with removed_at IS NULL, so a removed manager frees the seat.
 */

const idSchema = z.uuid()

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string; userId: string }> },
) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }
  const workspaceId = session.profile.workspace_id

  const { id: groupId, userId: targetId } = await params
  if (
    !idSchema.safeParse(groupId).success ||
    !idSchema.safeParse(targetId).success
  ) {
    return Response.json({ error: 'not found' }, { status: 404 })
  }

  const service = serviceClient()
  const authz = await authorize(service, session.userId, {
    workspaceId,
    groupId,
    action: 'member.remove',
  })
  if (!authz.ok) {
    return Response.json({ error: authz.reason }, { status: authz.status })
  }

  const { data, error } = await service
    .from('group_members')
    .update({ removed_at: new Date().toISOString() })
    .eq('group_id', groupId)
    .eq('user_id', targetId)
    .is('removed_at', null)
    .select()
    .maybeSingle()

  if (error) {
    return Response.json({ error: 'removal failed' }, { status: 500 })
  }
  if (!data) {
    return Response.json({ error: 'not an active member' }, { status: 404 })
  }

  // Layer 2: kill the refresh token. A failure here must surface — an
  // ex-member with a renewable session is the exact thing the spec forbids.
  await revokeUserSessions(service, targetId)

  // Layer 3: force any open client off the group NOW. Best-effort — the two
  // layers above already cut data access, so a realtime hiccup must not turn
  // a successful removal into a 500.
  try {
    const channel = service.channel(`user:${targetId}`)
    await channel.send({
      type: 'broadcast',
      event: 'member_removed',
      payload: { group_id: groupId, workspace_id: workspaceId },
    })
    await service.removeChannel(channel)
  } catch {
    // Realtime unavailable — acceptable; RLS + revocation hold the line.
  }

  await audit(service, {
    workspaceId,
    actorId: session.userId,
    actorDisplayName: session.profile.display_name,
    groupId,
    groupName: authz.group?.name,
    eventType: 'member.removed',
    payload: { user_id: targetId },
  })

  return Response.json({ removed: true })
}
