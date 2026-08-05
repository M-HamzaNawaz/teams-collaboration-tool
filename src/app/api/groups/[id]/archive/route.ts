import { z } from 'zod'

import { audit } from '@/lib/audit/audit'
import { getSession } from '@/lib/auth/session'
import { authorize } from '@/lib/authz/authorize'
import { serviceClient } from '@/lib/supabase/service-client'
import type { GroupRow } from '@/lib/types'

/**
 * POST /api/groups/:id/archive (M4-02).
 *
 * active → archived. From this moment the group is read-only and invisible
 * to members (RLS groups_select, I3) but fully readable by the admin.
 * authorize() only grants group.archive on an ACTIVE group, so archiving
 * twice — or archiving a tombstone — is a 403, not a silent no-op.
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

  const { id } = await params
  if (!idSchema.safeParse(id).success) {
    // Malformed id gets the same answer as a foreign one: not found.
    return Response.json({ error: 'group not found' }, { status: 404 })
  }

  const service = serviceClient()
  const authz = await authorize(service, session.userId, {
    workspaceId: session.profile.workspace_id,
    groupId: id,
    action: 'group.archive',
  })
  if (!authz.ok) {
    return Response.json({ error: authz.reason }, { status: authz.status })
  }

  const { data, error } = await service
    .from('groups')
    .update({ status: 'archived', archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'active') // guard against a race with a concurrent archive
    .select()
    .single()

  if (error) {
    return Response.json({ error: 'archive failed' }, { status: 500 })
  }
  const group = data as GroupRow

  await audit(service, {
    workspaceId: group.workspace_id,
    actorId: session.userId,
    actorDisplayName: session.profile.display_name,
    groupId: group.id,
    groupName: group.name,
    eventType: 'group.archived',
  })

  return Response.json({ group })
}
