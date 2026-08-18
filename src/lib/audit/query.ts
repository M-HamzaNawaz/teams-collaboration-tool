import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * One page of the audit log, shared by the API route and the server page
 * so /app/audit paints real rows on arrival (no second client-side
 * skeleton). Keyset pagination on id — stable under concurrent inserts,
 * which an append-only log has constantly. Caller handles authorization.
 */

export type AuditEntry = {
  id: number
  actor_id: string | null
  actor_display_name: string
  group_id: string | null
  group_name: string
  event_type: string
  payload_jsonb: Record<string, unknown>
  created_at: string
}

export type AuditPageFilters = {
  groupId?: string
  actorName?: string
  eventType?: string
  from?: string
  to?: string
  before?: number
  limit: number
}

export async function queryAuditPage(
  service: SupabaseClient,
  workspaceId: string,
  q: AuditPageFilters,
): Promise<{ entries: AuditEntry[]; nextBefore: number | null } | null> {
  let query = service
    .from('audit_log')
    .select(
      'id, actor_id, actor_display_name, group_id, group_name, event_type, payload_jsonb, created_at',
    )
    .eq('workspace_id', workspaceId)
    .order('id', { ascending: false })
    .limit(q.limit)

  if (q.groupId) query = query.eq('group_id', q.groupId)
  if (q.actorName) query = query.ilike('actor_display_name', `%${q.actorName}%`)
  if (q.eventType) query = query.ilike('event_type', `${q.eventType}%`)
  if (q.from) query = query.gte('created_at', q.from)
  if (q.to) query = query.lte('created_at', q.to)
  if (q.before) query = query.lt('id', q.before)

  const { data, error } = await query
  if (error) return null

  const entries = (data ?? []) as AuditEntry[]
  return {
    entries,
    nextBefore:
      entries.length === q.limit ? entries[entries.length - 1].id : null,
  }
}
