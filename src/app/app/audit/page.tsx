import { queryAuditPage } from '@/lib/audit/query'
import { getSession } from '@/lib/auth/session'
import { serviceClient } from '@/lib/supabase/service-client'
import { userClient } from '@/lib/supabase/user-client'
import type { GroupRow } from '@/lib/types'

import { AuditViewer } from './audit-viewer'

/** /app/audit (M9-02) — admin-only evidence surface. */
export default async function AuditPage() {
  const session = await getSession()
  if (!session) return null

  if (session.profile.member_role !== 'admin') {
    return (
      <main className="flex h-full items-center justify-center p-6">
        <p className="text-muted">The audit log is for workspace admins.</p>
      </main>
    )
  }

  // Group filter options — admin sees every state through RLS, tombstones
  // included, which is the point: evidence outlives the group.
  const supabase = await userClient()
  const service = serviceClient()
  const workspaceId = session.profile.workspace_id

  // First page + chain status fetched HERE so the client paints real rows
  // on arrival — the route skeleton is the only loading state (the chat
  // page's double-skeleton fix).
  const [{ data: groups }, firstPage, { data: check }] = await Promise.all([
    supabase
      .from('groups')
      .select('id, name, status')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false }),
    queryAuditPage(service, workspaceId, { limit: 50 }),
    service
      .from('audit_chain_checks')
      .select('ok, first_bad_id, checked_at')
      .eq('workspace_id', workspaceId)
      .maybeSingle(),
  ])

  return (
    <AuditViewer
      groups={(groups ?? []) as Pick<GroupRow, 'id' | 'name' | 'status'>[]}
      initialEntries={firstPage?.entries}
      initialNextBefore={firstPage?.nextBefore}
      initialCheck={check ?? null}
    />
  )
}
