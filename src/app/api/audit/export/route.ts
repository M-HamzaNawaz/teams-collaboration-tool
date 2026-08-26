import { z } from 'zod'

import { audit } from '@/lib/audit/audit'
import { getSession } from '@/lib/auth/session'
import { authorize } from '@/lib/authz/authorize'
import { serviceClient } from '@/lib/supabase/service-client'

/**
 * GET /api/audit/export (M9-02) — CSV, same filters as the query API.
 * The dispute artifact: a full timeline an agency can hand to a lawyer.
 * Capped at 10,000 rows per export; narrow the date range beyond that.
 *
 * Two opt-in columns, because the timeline alone proves a process ran but
 * not what it caught — every held row says `findings_count: 1`, and one
 * WHAT is the fact a dispute actually turns on:
 *
 *   ?findings=1  the matched text and the rule that caught it, from
 *                message_flags. This is the evidence: "member tried to send
 *                03001234567". Already stored and hash-chained; it was only
 *                ever missing from the join.
 *   ?body=1      the full message text. Everything around the finding is
 *                ordinary confidential client conversation — the thing this
 *                platform exists to keep in — so it is off by default and
 *                asked for explicitly.
 *
 * Requesting either records an audit.exported entry naming what left. A file
 * of message bodies leaving the building is precisely the kind of event this
 * log exists for, and an evidence surface that cannot say who copied it is a
 * weaker one.
 */

const querySchema = z.object({
  groupId: z.uuid().optional(),
  actorName: z.string().trim().min(1).max(80).optional(),
  eventType: z.string().trim().min(1).max(80).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  findings: z.enum(['1']).optional(),
  body: z.enum(['1']).optional(),
})

const EXPORT_CAP = 10_000

/** "phone.contiguous \"03001234567\" (0.97)" — rule, match, confidence. */
function renderFindings(raw: unknown): string {
  if (!Array.isArray(raw)) return ''
  return raw
    .map((entry) => {
      const f = entry as {
        rule_id?: string
        match?: string
        confidence?: number
      }
      const confidence =
        typeof f.confidence === 'number' ? ` (${f.confidence.toFixed(2)})` : ''
      return `${f.rule_id ?? 'unknown'} "${f.match ?? ''}"${confidence}`
    })
    .join('; ')
}

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

  const wantFindings = q.findings === '1'
  const wantBody = q.body === '1'

  // Both columns hang off payload_jsonb.message_id, which every message
  // event carries. Fetched in chunks so a 10k export does not become one
  // enormous IN list.
  const findingsById = new Map<string, string>()
  const bodyById = new Map<string, string>()

  if (wantFindings || wantBody) {
    const messageIds = [
      ...new Set(
        (data ?? [])
          .map(
            (r) => (r.payload_jsonb as { message_id?: string } | null)?.message_id,
          )
          .filter((id): id is string => typeof id === 'string'),
      ),
    ]

    for (let i = 0; i < messageIds.length; i += 500) {
      const chunk = messageIds.slice(i, i + 500)
      if (wantFindings) {
        const { data: flags } = await service
          .from('message_flags')
          .select('message_id, findings_jsonb')
          .in('message_id', chunk)
        for (const flag of (flags ?? []) as Array<{
          message_id: string
          findings_jsonb: unknown
        }>) {
          findingsById.set(flag.message_id, renderFindings(flag.findings_jsonb))
        }
      }
      if (wantBody) {
        const { data: messages } = await service
          .from('messages')
          .select('id, body')
          .in('id', chunk)
        for (const message of (messages ?? []) as Array<{
          id: string
          body: string
        }>) {
          bodyById.set(message.id, message.body)
        }
      }
    }
  }

  const header = [
    'id',
    'timestamp',
    'actor',
    'event',
    'group',
    'details',
    ...(wantFindings ? ['findings'] : []),
    ...(wantBody ? ['message'] : []),
  ].join(',')

  const rows = (data ?? []).map((r) => {
    const messageId = (r.payload_jsonb as { message_id?: string } | null)
      ?.message_id
    return [
      r.id,
      r.created_at,
      csvCell(r.actor_display_name),
      r.event_type,
      csvCell(r.group_name),
      csvCell(JSON.stringify(r.payload_jsonb)),
      ...(wantFindings
        ? [csvCell(messageId ? (findingsById.get(messageId) ?? '') : '')]
        : []),
      ...(wantBody
        ? [csvCell(messageId ? (bodyById.get(messageId) ?? '') : '')]
        : []),
    ].join(',')
  })

  // Only the content exports are recorded. A bare timeline is the evidence
  // surface doing its job; message text leaving the platform is an event in
  // its own right, and audit() throwing on failure is the right severity for
  // that one and too harsh for the other.
  if (wantFindings || wantBody) {
    await audit(service, {
      workspaceId,
      actorId: session.userId,
      actorDisplayName: session.profile.display_name,
      eventType: 'audit.exported',
      payload: {
        rows: rows.length,
        included: [
          ...(wantFindings ? ['findings'] : []),
          ...(wantBody ? ['message_body'] : []),
        ],
        filters: {
          group_id: q.groupId ?? null,
          actor_name: q.actorName ?? null,
          event_type: q.eventType ?? null,
          from: q.from ?? null,
          to: q.to ?? null,
        },
      },
    })
  }

  return new Response([header, ...rows].join('\n'), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="confide-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  })
}
