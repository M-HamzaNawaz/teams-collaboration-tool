import { getSession } from '@/lib/auth/session'
import { serviceClient } from '@/lib/supabase/service-client'
import { userClient } from '@/lib/supabase/user-client'
import type { GroupRow } from '@/lib/types'

import { Dashboard, type DashboardData } from './dashboard'

/**
 * Start of the rolling 7-day stats window. Extracted from the component:
 * this page is dynamic (per-request, cookie-bound), so reading the clock is
 * correct here — but it must not sit inline in a render body.
 */
function statsWindowStart(): string {
  return new Date(Date.now() - 7 * 24 * 3600_000).toISOString()
}

/**
 * /app — the dashboard, tailored per role.
 *
 * The product's thesis made visible: an admin's home is the control layer
 * (what's waiting, what detection caught, whether the evidence chain still
 * verifies), not a chat window. Members and clients get their own version:
 * their groups, their unread, and the status of any message of theirs that
 * is waiting on review.
 */
export default async function DashboardPage() {
  const session = await getSession()
  if (!session) return null // layout redirects

  const workspaceId = session.profile.workspace_id
  const role = session.profile.member_role
  const isAdmin = role === 'admin'
  const supabase = await userClient()
  const service = serviceClient()

  // ── Everyone: my groups (RLS-scoped) + unread counts ───────────────────
  const [{ data: groups }, { data: memberships }] = await Promise.all([
    supabase
      .from('groups')
      .select('*')
      .eq('workspace_id', workspaceId)
      .eq('status', 'active')
      .order('created_at', { ascending: false }),
    supabase
      .from('group_members')
      .select('group_id, group_role, last_read_at')
      .eq('user_id', session.userId)
      .is('removed_at', null),
  ])

  const groupRows = (groups ?? []) as GroupRow[]
  const myMemberships = (memberships ?? []) as Array<{
    group_id: string
    group_role: string
    last_read_at: string | null
  }>
  const lastReadByGroup = new Map(
    myMemberships.map((m) => [m.group_id, m.last_read_at]),
  )

  const unreadByGroup: Record<string, number> = {}
  await Promise.all(
    groupRows.map(async (group) => {
      let query = supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('group_id', group.id)
        .eq('status', 'delivered')
        .neq('sender_id', session.userId)
      const lastRead = lastReadByGroup.get(group.id)
      if (lastRead) query = query.gt('delivered_at', lastRead)
      const { count } = await query
      if (count) unreadByGroup[group.id] = count
    }),
  )

  // ── Everyone: my own messages awaiting review (never silently gone) ────
  const { count: myPending } = await supabase
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('sender_id', session.userId)
    .eq('status', 'pending')

  const data: DashboardData = {
    role,
    displayName: session.profile.display_name,
    groups: groupRows.map((g) => ({
      id: g.id,
      name: g.name,
      unread: unreadByGroup[g.id] ?? 0,
      isManager:
        myMemberships.find((m) => m.group_id === g.id)?.group_role ===
        'manager',
    })),
    myPendingCount: myPending ?? 0,
    oversight: null,
  }

  // ── Moderators: the queue that is theirs to clear ─────────────────────
  const managedGroupIds = myMemberships
    .filter((m) => m.group_role === 'manager')
    .map((m) => m.group_id)
  const canModerate =
    isAdmin || (role !== 'client' && managedGroupIds.length > 0)

  if (canModerate) {
    let pendingQuery = service
      .from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('status', 'pending')
    if (!isAdmin) pendingQuery = pendingQuery.in('group_id', managedGroupIds)
    const { count: pendingCount } = await pendingQuery

    // Admin-only: workspace-wide numbers and the evidence surface.
    let flagged7d = 0
    let blocked7d = 0
    let autoApproved7d = 0
    let memberCount = 0
    let archivedCount = 0
    let chain: { ok: boolean; checkedAt: string } | null = null
    let recent: Array<{ id: number; actor: string; event: string; group: string; at: string }> = []

    if (isAdmin) {
      const weekAgo = statsWindowStart()
      const [flags, members, archived, chainCheck, audit] = await Promise.all([
        service
          .from('message_flags')
          .select('action, resolution')
          .eq('workspace_id', workspaceId)
          .gte('created_at', weekAgo),
        service
          .from('profiles')
          .select('user_id', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId),
        service
          .from('groups')
          .select('id', { count: 'exact', head: true })
          .eq('workspace_id', workspaceId)
          .eq('status', 'archived'),
        service
          .from('audit_chain_checks')
          .select('ok, checked_at')
          .eq('workspace_id', workspaceId)
          .maybeSingle(),
        service
          .from('audit_log')
          .select('id, actor_display_name, event_type, group_name, created_at')
          .eq('workspace_id', workspaceId)
          .order('id', { ascending: false })
          .limit(6),
      ])

      const flagRows = (flags.data ?? []) as Array<{
        action: string
        resolution: string | null
      }>
      flagged7d = flagRows.length
      blocked7d = flagRows.filter((f) => f.resolution === 'blocked').length
      autoApproved7d = flagRows.filter(
        (f) => f.resolution === 'auto_approved',
      ).length
      memberCount = members.count ?? 0
      archivedCount = archived.count ?? 0
      chain = chainCheck.data
        ? {
            ok: chainCheck.data.ok as boolean,
            checkedAt: chainCheck.data.checked_at as string,
          }
        : null
      recent = ((audit.data ?? []) as Array<Record<string, unknown>>).map(
        (entry) => ({
          id: entry.id as number,
          actor: (entry.actor_display_name as string) || 'system',
          event: entry.event_type as string,
          group: (entry.group_name as string) || '',
          at: entry.created_at as string,
        }),
      )
    }

    data.oversight = {
      pendingCount: pendingCount ?? 0,
      scope: isAdmin ? 'workspace' : 'groups',
      flagged7d,
      blocked7d,
      autoApproved7d,
      memberCount,
      activeGroupCount: groupRows.length,
      archivedCount,
      chain,
      recent,
    }
  }

  return <Dashboard data={data} />
}
