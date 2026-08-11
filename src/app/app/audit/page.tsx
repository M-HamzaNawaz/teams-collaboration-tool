import { getSession } from '@/lib/auth/session'
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
  const { data: groups } = await supabase
    .from('groups')
    .select('id, name, status')
    .eq('workspace_id', session.profile.workspace_id)
    .order('created_at', { ascending: false })

  return (
    <AuditViewer
      groups={(groups ?? []) as Pick<GroupRow, 'id' | 'name' | 'status'>[]}
    />
  )
}
