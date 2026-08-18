import { z } from 'zod'

import { getSession } from '@/lib/auth/session'
import { authorize } from '@/lib/authz/authorize'
import { queryAuditPage } from '@/lib/audit/query'
import { serviceClient } from '@/lib/supabase/service-client'

/**
 * GET /api/audit (M9-01) — the evidence query. Admin-only via
 * authorize(workspace.manage); a manager gets 403 (acceptance).
 *
 * Filters COMPOSE (group, actor name, event type, date range) and paginate
 * by keyset on id — stable under concurrent inserts, which an append-only
 * log has constantly. Reads the DENORMALIZED actor_display_name/group_name
 * columns, so entries outlive the people and groups they mention.
 */

const querySchema = z.object({
  groupId: z.uuid().optional(),
  actorName: z.string().trim().min(1).max(80).optional(),
  eventType: z.string().trim().min(1).max(80).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  before: z.coerce.number().int().positive().optional(), // keyset cursor
  limit: z.coerce.number().int().min(1).max(200).default(50),
})

export async function GET(request: Request) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }
  const workspaceId = session.profile.workspace_id

  const url = new URL(request.url)
  const parsed = querySchema.safeParse(
    Object.fromEntries(url.searchParams.entries()),
  )
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'invalid query' },
      { status: 400 },
    )
  }
  const q = parsed.data

  const service = serviceClient()
  const authz = await authorize(service, session.userId, {
    workspaceId,
    action: 'workspace.manage',
  })
  if (!authz.ok) {
    return Response.json({ error: authz.reason }, { status: authz.status })
  }

  const result = await queryAuditPage(service, workspaceId, q)
  if (!result) {
    return Response.json({ error: 'audit query failed' }, { status: 500 })
  }
  return Response.json(result)
}
