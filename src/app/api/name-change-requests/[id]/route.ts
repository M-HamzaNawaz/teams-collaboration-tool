import { z } from 'zod'

import { audit } from '@/lib/audit/audit'
import { getSession } from '@/lib/auth/session'
import { authorize } from '@/lib/authz/authorize'
import { serviceClient } from '@/lib/supabase/service-client'

/**
 * PATCH /api/name-change-requests/:id (M4-07) — admin review.
 *
 * Approve: the ONLY path that turns a member's requested string into a
 * live display_name — and it is an admin action on a pre-scanned value
 * (I2 stays intact: members never write profiles, admins do).
 * The audit entry records old and new names (acceptance criterion).
 */

const idSchema = z.uuid()
const bodySchema = z.object({
  decision: z.enum(['approved', 'rejected']),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }
  const workspaceId = session.profile.workspace_id

  const { id } = await params
  if (!idSchema.safeParse(id).success) {
    return Response.json({ error: 'request not found' }, { status: 404 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json(
      { error: "decision must be 'approved' or 'rejected'" },
      { status: 400 },
    )
  }
  const { decision } = parsed.data

  const service = serviceClient()
  const authz = await authorize(service, session.userId, {
    workspaceId,
    action: 'name_change.review',
  })
  if (!authz.ok) {
    return Response.json({ error: authz.reason }, { status: authz.status })
  }

  // Claim the pending request; the status guard makes double-review a 404
  // (already decided) rather than a second write.
  const { data: reviewed, error } = await service
    .from('name_change_requests')
    .update({
      status: decision,
      reviewed_by: session.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
    .select('user_id, requested_name')
    .maybeSingle()

  if (error) {
    return Response.json({ error: 'review failed' }, { status: 500 })
  }
  if (!reviewed) {
    return Response.json({ error: 'request not found' }, { status: 404 })
  }

  const targetId = reviewed.user_id as string
  const requestedName = reviewed.requested_name as string

  // Fetch old name for the audit entry; apply the new one on approval.
  const { data: profile } = await service
    .from('profiles')
    .select('display_name')
    .eq('user_id', targetId)
    .eq('workspace_id', workspaceId)
    .single()
  const oldName = (profile?.display_name as string) ?? ''

  if (decision === 'approved') {
    const { error: applyError } = await service
      .from('profiles')
      .update({ display_name: requestedName })
      .eq('user_id', targetId)
      .eq('workspace_id', workspaceId)
    if (applyError) {
      return Response.json({ error: 'applying the name failed' }, { status: 500 })
    }
  }

  await audit(service, {
    workspaceId,
    actorId: session.userId,
    actorDisplayName: session.profile.display_name,
    eventType: `name_change.${decision}`,
    payload: {
      request_id: id,
      user_id: targetId,
      old_name: oldName,
      new_name: decision === 'approved' ? requestedName : oldName,
      requested_name: requestedName,
    },
  })

  return Response.json({ request: { id, status: decision } })
}
