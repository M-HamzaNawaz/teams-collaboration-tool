import { z } from 'zod'

import { audit } from '@/lib/audit/audit'
import { getSession } from '@/lib/auth/session'
import { authorize } from '@/lib/authz/authorize'
import { serviceClient } from '@/lib/supabase/service-client'
import type { GroupMemberRow } from '@/lib/types'

/**
 * POST /api/groups/:id/members (M4-03) — add a member, admin-only.
 *
 * "At most one Manager per group" is NOT checked here: the partial unique
 * index one_manager_per_group (M1-02) is the enforcement, and this route
 * just translates its violation into a 409. Application code that merely
 * re-implements a database constraint drifts; code that trusts it cannot.
 *
 * A previously removed member is re-activated in place (same PK row, fresh
 * joined_at) — membership history stays one row per person per group.
 */

const idSchema = z.uuid()
const bodySchema = z.object({
  userId: z.uuid(),
  role: z.enum(['member', 'manager']).default('member'),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }
  const workspaceId = session.profile.workspace_id

  const { id: groupId } = await params
  if (!idSchema.safeParse(groupId).success) {
    return Response.json({ error: 'group not found' }, { status: 404 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'invalid input' },
      { status: 400 },
    )
  }
  const { userId: targetId, role } = parsed.data

  const service = serviceClient()
  const authz = await authorize(service, session.userId, {
    workspaceId,
    groupId,
    action: 'member.add',
  })
  if (!authz.ok) {
    return Response.json({ error: authz.reason }, { status: authz.status })
  }

  // Archived and deleted groups are read-only (I3) — membership included.
  if (authz.group && authz.group.status !== 'active') {
    return Response.json(
      { error: `group is ${authz.group.status} and read-only (I3)` },
      { status: 403 },
    )
  }

  // The target must already hold a profile in THIS workspace. A uuid from
  // another workspace gets the same 404 as a random one — no probe oracle.
  const { data: targetProfile } = await service
    .from('profiles')
    .select('display_name')
    .eq('user_id', targetId)
    .eq('workspace_id', workspaceId)
    .maybeSingle()

  if (!targetProfile) {
    return Response.json({ error: 'user not found' }, { status: 404 })
  }

  const { data: existing } = await service
    .from('group_members')
    .select('removed_at')
    .eq('group_id', groupId)
    .eq('user_id', targetId)
    .maybeSingle()

  if (existing && existing.removed_at === null) {
    return Response.json({ error: 'already a group member' }, { status: 409 })
  }

  const { data, error } = await service
    .from('group_members')
    .upsert(
      {
        group_id: groupId,
        user_id: targetId,
        workspace_id: workspaceId,
        group_role: role,
        joined_at: new Date().toISOString(),
        removed_at: null,
      },
      { onConflict: 'group_id,user_id' },
    )
    .select()
    .single()

  if (error) {
    if (error.code === '23505') {
      // one_manager_per_group — the database said no.
      return Response.json(
        { error: 'this group already has a manager' },
        { status: 409 },
      )
    }
    return Response.json({ error: 'failed to add member' }, { status: 500 })
  }

  await audit(service, {
    workspaceId,
    actorId: session.userId,
    actorDisplayName: session.profile.display_name,
    groupId,
    groupName: authz.group?.name,
    eventType: existing ? 'member.rejoined' : 'member.added',
    payload: { user_id: targetId, group_role: role },
  })

  return Response.json({ member: data as GroupMemberRow }, { status: 201 })
}
