import { z } from 'zod'

import { getSession } from '@/lib/auth/session'
import { authorize } from '@/lib/authz/authorize'
import { projectProfile, type VisibilityRule } from '@/lib/masking/project'
import { serviceClient } from '@/lib/supabase/service-client'
import type { ProfileRow } from '@/lib/types'

/**
 * GET /api/groups/:id/profiles (M8-03) — the ONLY way a member learns who
 * else is in a group, and every entry has been through projectProfile().
 *
 * Row scope: active members of THIS group (authorize gates entry, so the
 * no-directory rule holds — you can enumerate exactly the people in your
 * own groups and nobody else). Field scope: the workspace's visibility
 * rules against the CALLER's role.
 */

const idSchema = z.uuid()

export async function GET(
  _request: Request,
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

  const service = serviceClient()
  const authz = await authorize(service, session.userId, {
    workspaceId,
    groupId,
    action: 'group.read',
  })
  if (!authz.ok) {
    return Response.json({ error: authz.reason }, { status: authz.status })
  }

  const { data: members } = await service
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .is('removed_at', null)

  const memberIds = (members ?? []).map((m) => m.user_id as string)
  if (memberIds.length === 0) return Response.json({ profiles: [] })

  const [{ data: profiles }, { data: rules }] = await Promise.all([
    service
      .from('profiles')
      .select('*')
      .eq('workspace_id', workspaceId)
      .in('user_id', memberIds),
    service
      .from('role_visibility_rules')
      .select('viewer_role, target_role, visible_fields')
      .eq('workspace_id', workspaceId),
  ])

  return Response.json({
    profiles: ((profiles ?? []) as ProfileRow[]).map((profile) =>
      projectProfile(
        session.profile.member_role,
        profile,
        (rules ?? []) as VisibilityRule[],
      ),
    ),
  })
}
