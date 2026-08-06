import { z } from 'zod'

import { getSession } from '@/lib/auth/session'
import { authorize } from '@/lib/authz/authorize'
import { serviceClient } from '@/lib/supabase/service-client'

/**
 * GET /api/audit/export (M9-02) — CSV, same filters as the query API.
 * The dispute artifact: a full timeline an agency can hand to a lawyer.
 * Capped at 10,000 rows per export; narrow the date range beyond that.
 */

const querySchema = z.object({
  groupId: z.uuid().optional(),
  actorName: z.string().trim().min(1).max(80).optional(),
  eventType: z.string().trim().min(1).max(80).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
})

const EXPORT_CAP = 10_000

function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value)
  return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s
}

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
    return Response.json({ error: 'invalid query' }, { status: 400 })
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

  let query = service
    .from('audit_log')
    .select(
      'id, created_at, actor_display_name, event_type, group_name, payload_jsonb',
    )
    .eq('workspace_id', workspaceId)
    .order('id', { ascending: true })
    .limit(EXPORT_CAP)

  if (q.groupId) query = query.eq('group_id', q.groupId)
  if (q.actorName) query = query.ilike('actor_display_name', `%${q.actorName}%`)
  if (q.eventType) query = query.ilike('event_type', `${q.eventType}%`)
  if (q.from) query = query.gte('created_at', q.from)
  if (q.to) query = query.lte('created_at', q.to)

  const { data, error } = await query
  if (error) {
    return Response.json({ error: 'export failed' }, { status: 500 })
  }

  const header = 'id,timestamp,actor,event,group,details'
  const rows = (data ?? []).map((r) =>
    [
      r.id,
      r.created_at,
      csvCell(r.actor_display_name),
      r.event_type,
      csvCell(r.group_name),
      csvCell(JSON.stringify(r.payload_jsonb)),
    ].join(','),
  )

  return new Response([header, ...rows].join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="confide-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
