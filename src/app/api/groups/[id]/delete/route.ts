import { z } from 'zod'

import { getSession } from '@/lib/auth/session'
import { authorize } from '@/lib/authz/authorize'
import { serviceClient } from '@/lib/supabase/service-client'

/**
 * POST /api/groups/:id/delete (M4-02) — permanent deletion, step two of two.
 *
 * authorize() refuses unless the group is already ARCHIVED (spec §8.5: never
 * straight from active). The body must repeat the group's exact name — the
 * server-side half of the type-to-confirm dialog, so a stray API call can't
 * purge a group any more than a stray click can.
 *
 * The purge itself (messages → flags via cascade, file rows, tombstone,
 * audit entry) is a single database transaction: delete_group_permanently()
 * (20260806110000). The group ROW survives as a tombstone — I3.
 */

const idSchema = z.uuid()
const bodySchema = z.object({
  confirmName: z.string().min(1),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }

  const { id } = await params
  if (!idSchema.safeParse(id).success) {
    return Response.json({ error: 'group not found' }, { status: 404 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json(
      { error: 'confirmName is required' },
      { status: 400 },
    )
  }

  const service = serviceClient()
  const authz = await authorize(service, session.userId, {
    workspaceId: session.profile.workspace_id,
    groupId: id,
    action: 'group.delete',
  })
  if (!authz.ok) {
    return Response.json({ error: authz.reason }, { status: authz.status })
  }

  // authz.group is always set for a granted group-targeted action.
  if (authz.group && parsed.data.confirmName !== authz.group.name) {
    return Response.json(
      { error: 'confirmName does not match the group name' },
      { status: 400 },
    )
  }

  const { data, error } = await service.rpc('delete_group_permanently', {
    p_group_id: id,
    p_actor_id: session.userId,
    p_actor_display_name: session.profile.display_name,
  })

  if (error) {
    return Response.json({ error: 'deletion failed' }, { status: 500 })
  }

  return Response.json({ deleted: true, purged: data })
}
