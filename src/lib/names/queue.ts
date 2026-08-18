import type { Finding } from '@/lib/detection'
import { serviceClient } from '@/lib/supabase/service-client'

/**
 * The pending name-change queue, shared by the API route and the server
 * page so /app/names paints real cards on arrival (no second client-side
 * skeleton). Caller is responsible for authorization — both callers gate
 * on admin before reaching this.
 */

export type NameRequestItem = {
  id: string
  userId: string
  currentName: string
  requestedName: string
  findings: Finding[]
  flagged: boolean
  createdAt: string
}

export async function buildNameQueue(
  workspaceId: string,
): Promise<NameRequestItem[] | null> {
  const service = serviceClient()

  // Queue with the requester's current identity joined in — the admin
  // decides between old and new, so show both. Findings ship as stored.
  const { data, error } = await service
    .from('name_change_requests')
    .select('id, user_id, requested_name, findings_jsonb, status, created_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) return null

  const requests = data ?? []
  const userIds = [...new Set(requests.map((r) => r.user_id as string))]
  const { data: profiles } = userIds.length
    ? await service
        .from('profiles')
        .select('user_id, display_name')
        .eq('workspace_id', workspaceId)
        .in('user_id', userIds)
    : { data: [] }

  const nameByUser = new Map(
    (profiles ?? []).map((p) => [p.user_id as string, p.display_name as string]),
  )

  return requests.map((r) => ({
    id: r.id as string,
    userId: r.user_id as string,
    currentName: nameByUser.get(r.user_id as string) ?? '',
    requestedName: r.requested_name as string,
    findings: (r.findings_jsonb ?? []) as Finding[],
    flagged: Array.isArray(r.findings_jsonb) && r.findings_jsonb.length > 0,
    createdAt: r.created_at as string,
  }))
}
