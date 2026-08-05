import { z } from 'zod'

import { audit } from '@/lib/audit/audit'
import { getSession } from '@/lib/auth/session'
import { authorize } from '@/lib/authz/authorize'
import { serviceClient } from '@/lib/supabase/service-client'
import { userClient } from '@/lib/supabase/user-client'
import type { GroupRow } from '@/lib/types'

/**
 * /api/groups (M4-01).
 *
 * POST — create a group. Admin-only via authorize() (I1: group creation is
 *        the ONLY way a conversation comes into existence, and only an admin
 *        can trigger it). Writes with the service client; audited.
 *
 * GET  — list the caller's groups. Read through the USER client, so RLS is
 *        the authority on visibility: members get their own ACTIVE groups,
 *        admins get every group in the workspace including archived (I3).
 *        There is no group directory — what RLS hides does not exist here.
 */

const createSchema = z.object({
  name: z.string().trim().min(2).max(80),
})

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }
  const workspaceId = session.profile.workspace_id

  const parsed = createSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'invalid input' },
      { status: 400 },
    )
  }

  const service = serviceClient()
  const authz = await authorize(service, session.userId, {
    workspaceId,
    action: 'group.create',
  })
  if (!authz.ok) {
    return Response.json({ error: authz.reason }, { status: authz.status })
  }

  const { data, error } = await service
    .from('groups')
    .insert({
      workspace_id: workspaceId,
      name: parsed.data.name,
      status: 'active',
      created_by: session.userId,
    })
    .select()
    .single()

  if (error) {
    return Response.json({ error: 'group creation failed' }, { status: 500 })
  }
  const group = data as GroupRow

  // Member list is part of the creation record (TECHNICAL_PLAN §4.1 — the
  // audit trail is how a 2-person "de facto DM" group stays visible to
  // review). Empty at creation; M4-03 adds members with their own entries.
  await audit(service, {
    workspaceId,
    actorId: session.userId,
    actorDisplayName: session.profile.display_name,
    groupId: group.id,
    groupName: group.name,
    eventType: 'group.created',
    payload: { members: [] },
  })

  return Response.json({ group }, { status: 201 })
}

export async function GET() {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }

  // RLS-enforced read: the groups_select policy decides what exists for this
  // caller. Scoped to the active workspace — a multi-workspace admin's other
  // agencies never bleed into this list.
  const supabase = await userClient()
  const { data, error } = await supabase
    .from('groups')
    .select('*')
    .eq('workspace_id', session.profile.workspace_id)
    .order('created_at', { ascending: false })

  if (error) {
    return Response.json({ error: 'failed to list groups' }, { status: 500 })
  }

  return Response.json({ groups: (data ?? []) as GroupRow[] })
}
