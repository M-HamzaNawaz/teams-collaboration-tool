import { z } from 'zod'

import { getSession } from '@/lib/auth/session'
import { authorize } from '@/lib/authz/authorize'
import { serviceClient } from '@/lib/supabase/service-client'

/**
 * POST /api/groups/:id/read (M5-06) — advance the caller's read watermark.
 *
 * Sets last_read_at = now() on the caller's OWN membership row only. The
 * receipts other members render come from this value. High-frequency and
 * deliberately unaudited (see the migration note).
 */

const idSchema = z.uuid()

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }

  const { id: groupId } = await params
  if (!idSchema.safeParse(groupId).success) {
    return Response.json({ error: 'group not found' }, { status: 404 })
  }

  const service = serviceClient()
  const authz = await authorize(service, session.userId, {
    workspaceId: session.profile.workspace_id,
    groupId,
    action: 'group.read',
  })
  if (!authz.ok) {
    return Response.json({ error: authz.reason }, { status: authz.status })
  }

  const lastReadAt = new Date().toISOString()
  const { error } = await service
    .from('group_members')
    .update({ last_read_at: lastReadAt })
    .eq('group_id', groupId)
    .eq('user_id', session.userId)
    .is('removed_at', null)

  if (error) {
    return Response.json({ error: 'failed to mark read' }, { status: 500 })
  }

  return Response.json({ lastReadAt })
}
