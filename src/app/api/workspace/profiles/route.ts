import { getSession } from '@/lib/auth/session'
import { authorize } from '@/lib/authz/authorize'
import { projectProfile, type VisibilityRule } from '@/lib/masking/project'
import { serviceClient } from '@/lib/supabase/service-client'
import type { ProfileRow } from '@/lib/types'

/**
 * GET /api/workspace/profiles — the ADMIN's member directory, for the
 * add-to-group picker. Admin-only on purpose: for everyone else the
 * no-directory rule stands (you enumerate your own groups' members via
 * GET /api/groups/:id/profiles and nothing more). Still projected through
 * projectProfile() — one masking path, no exceptions (M8-03).
 */
export async function GET() {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }
  const workspaceId = session.profile.workspace_id

  const service = serviceClient()
  const authz = await authorize(service, session.userId, {
    workspaceId,
    action: 'workspace.manage', // admin-only
  })
  if (!authz.ok) {
    return Response.json({ error: authz.reason }, { status: authz.status })
  }

  const [{ data: profiles }, { data: rules }] = await Promise.all([
    service
      .from('profiles')
      .select('*')
      .eq('workspace_id', workspaceId)
      .order('display_name'),
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
