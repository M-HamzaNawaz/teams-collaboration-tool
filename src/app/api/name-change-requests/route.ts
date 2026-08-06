import { z } from 'zod'

import { audit } from '@/lib/audit/audit'
import { getSession } from '@/lib/auth/session'
import { authorize } from '@/lib/authz/authorize'
import { detect, type DetectionConfig } from '@/lib/detection'
import { serviceClient } from '@/lib/supabase/service-client'

/**
 * /api/name-change-requests (M4-07).
 *
 * POST — a member REQUESTS a new display name (I2: they cannot write it).
 *        The requested string runs through detect() HERE, before any admin
 *        sees it — otherwise this form is an unscanned channel into a field
 *        every client reads ("Ahmed — wa.me/923001234567" + a distracted
 *        admin = masking defeated). Findings are stored on the row.
 *
 * GET  — the admin queue, findings included so the UI can highlight spans.
 */

const bodySchema = z.object({
  requestedName: z.string().trim().min(1).max(60),
})

/** Per-workspace detection overrides live in workspaces.settings_jsonb. */
async function workspaceDetectionConfig(
  service: ReturnType<typeof serviceClient>,
  workspaceId: string,
): Promise<Partial<DetectionConfig> | undefined> {
  const { data } = await service
    .from('workspaces')
    .select('settings_jsonb')
    .eq('id', workspaceId)
    .single()
  const settings = data?.settings_jsonb as
    | { detection?: Partial<DetectionConfig> }
    | null
  return settings?.detection
}

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }
  const workspaceId = session.profile.workspace_id

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'invalid input' },
      { status: 400 },
    )
  }
  const requestedName = parsed.data.requestedName

  const service = serviceClient()

  // The load-bearing line: scan BEFORE the row an admin will read exists.
  const config = await workspaceDetectionConfig(service, workspaceId)
  const verdict = detect(requestedName, config)

  const { data, error } = await service
    .from('name_change_requests')
    .insert({
      workspace_id: workspaceId,
      user_id: session.userId,
      requested_name: requestedName,
      findings_jsonb: verdict.findings,
    })
    .select('id, status, findings_jsonb')
    .single()

  if (error) {
    if (error.code === '23505') {
      // one_pending_name_change — one open request per person, enforced by
      // the database (a queue of contradictory renames helps nobody).
      return Response.json(
        { error: 'you already have a request awaiting review' },
        { status: 409 },
      )
    }
    return Response.json({ error: 'request failed' }, { status: 500 })
  }

  await audit(service, {
    workspaceId,
    actorId: session.userId,
    actorDisplayName: session.profile.display_name,
    eventType: 'name_change.requested',
    payload: {
      request_id: data.id,
      current_name: session.profile.display_name,
      requested_name: requestedName,
      detection_action: verdict.action,
      findings_count: verdict.findings.length,
    },
  })

  return Response.json(
    {
      request: {
        id: data.id,
        status: data.status,
        // The requester sees THAT it will be reviewed, not what tripped the
        // scanner — findings would be a free rule-probing oracle.
        flagged: verdict.findings.length > 0,
      },
    },
    { status: 201 },
  )
}

export async function GET() {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }
  const workspaceId = session.profile.workspace_id

  const service = serviceClient()
  const authz = await authorize(service, session.userId, {
    workspaceId,
    action: 'name_change.review',
  })
  if (!authz.ok) {
    return Response.json({ error: authz.reason }, { status: authz.status })
  }

  // Queue with the requester's current identity joined in — the admin
  // decides between old and new, so show both. Findings ship as stored.
  const { data, error } = await service
    .from('name_change_requests')
    .select('id, user_id, requested_name, findings_jsonb, status, created_at')
    .eq('workspace_id', workspaceId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) {
    return Response.json({ error: 'failed to list requests' }, { status: 500 })
  }

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

  return Response.json({
    requests: requests.map((r) => ({
      id: r.id,
      userId: r.user_id,
      currentName: nameByUser.get(r.user_id as string) ?? '',
      requestedName: r.requested_name,
      findings: r.findings_jsonb,
      flagged: Array.isArray(r.findings_jsonb) && r.findings_jsonb.length > 0,
      createdAt: r.created_at,
    })),
  })
}
