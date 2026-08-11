import { z } from 'zod'

import { audit } from '@/lib/audit/audit'
import { createRateLimiter, rateLimitResponse } from '@/lib/auth/rate-limit'
import { getSession } from '@/lib/auth/session'
import { detect, type DetectionConfig } from '@/lib/detection'
import { serviceClient } from '@/lib/supabase/service-client'
import { stripFormatting } from '@/lib/ui/message-format'

/**
 * PATCH /api/workspace/profile — an ADMIN edits their own identity directly.
 *
 * I2 says identity is admin-controlled — and the admin IS the control, so
 * routing them through the request queue meant filing a ticket to themselves
 * and approving it. Members and clients still cannot reach this route: their
 * path stays POST /api/name-change-requests, reviewed by an admin.
 *
 * The one rule that survives even for admins: contact details are REFUSED.
 * A display name is broadcast to every client, and nobody reviews the admin,
 * so detect() is the only line of defense here — which is why it scans the
 * same way the messages route does (adversarially reviewed):
 *   - the raw value AND its formatting-stripped form ('0300**123**4567'
 *     reassembles visually once rendered);
 *   - the name and job title JOINED, digits collapsed — the two fields render
 *     adjacently in the members panel, so '…03001' + '234567…' would
 *     reconstruct a phone number across the field boundary;
 *   - refusals are AUDITED and the route is rate-limited, so probing the
 *     detector for an evasion leaves a trail and runs out of attempts.
 */

const bodySchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  roleLabel: z.string().trim().max(60).optional(),
})

/** 5 edits/minute — nobody legitimate renames themselves faster. */
const profileLimiter = createRateLimiter({ windowMs: 60_000, max: 5 })

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }
  if (session.profile.member_role !== 'admin') {
    return Response.json(
      { error: 'members request name changes; an admin reviews them' },
      { status: 403 },
    )
  }
  if (!profileLimiter.check(`profile:${session.userId}`)) {
    return rateLimitResponse()
  }
  const workspaceId = session.profile.workspace_id

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'invalid input' },
      { status: 400 },
    )
  }
  const { displayName, roleLabel } = parsed.data

  const service = serviceClient()

  // Same per-workspace detection overrides the request flow uses.
  const { data: workspace } = await service
    .from('workspaces')
    .select('settings_jsonb')
    .eq('id', workspaceId)
    .single()
  const config = (
    workspace?.settings_jsonb as { detection?: Partial<DetectionConfig> } | null
  )?.detection

  // Every form a reader could reconstruct: raw, formatting-stripped, and the
  // adjacent-field join with whitespace between digit runs collapsed.
  const candidates = new Set<string>()
  const joined = `${displayName} ${roleLabel ?? ''}`.trim()
  for (const value of [displayName, roleLabel ?? '', joined]) {
    if (!value) continue
    candidates.add(value)
    const stripped = stripFormatting(value)
    candidates.add(stripped)
    candidates.add(stripped.replace(/(\d)\s+(?=\d)/g, '$1'))
  }
  const flagged = [...candidates].some(
    (value) => detect(value, config).findings.length > 0,
  )
  if (flagged) {
    // A refusal is evidence too: unaudited 422s would be a free, silent
    // oracle for probing the detector until something slips through.
    await audit(service, {
      workspaceId,
      actorId: session.userId,
      actorDisplayName: session.profile.display_name,
      eventType: 'member.profile_update_refused',
      payload: {
        attempted_name: displayName,
        attempted_role_label: roleLabel ?? '',
      },
    })
    return Response.json(
      { error: 'names and job titles cannot contain contact details' },
      { status: 422 },
    )
  }

  // Read the row being overwritten — the audit entry must record the values
  // actually replaced, not a stale session snapshot.
  const { data: current } = await service
    .from('profiles')
    .select('display_name, role_label')
    .eq('workspace_id', workspaceId)
    .eq('user_id', session.userId)
    .maybeSingle()
  if (!current) {
    return Response.json(
      { error: 'profile no longer exists in this workspace' },
      { status: 404 },
    )
  }

  const { data: updated, error } = await service
    .from('profiles')
    .update({
      display_name: displayName,
      ...(roleLabel !== undefined ? { role_label: roleLabel } : {}),
    })
    .eq('workspace_id', workspaceId)
    .eq('user_id', session.userId)
    .select('user_id')
  if (error || !updated || updated.length === 0) {
    // Zero rows = the profile vanished mid-request. Nothing changed, so
    // nothing may be audited as if it had.
    return Response.json({ error: 'update failed' }, { status: error ? 500 : 404 })
  }

  // A direct edit supersedes the editor's own pending name-change request —
  // otherwise a later approval of the stale request would silently revert
  // this change.
  const { data: superseded } = await service
    .from('name_change_requests')
    .update({
      status: 'rejected',
      reviewed_by: session.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq('workspace_id', workspaceId)
    .eq('user_id', session.userId)
    .eq('status', 'pending')
    .select('id, requested_name')
    .maybeSingle()

  await audit(service, {
    workspaceId,
    actorId: session.userId,
    // The identity AT THE TIME of the action — the new name lives in the
    // payload, and the actor column must stay continuous with prior entries.
    actorDisplayName: current.display_name as string,
    eventType: 'member.profile_updated',
    payload: {
      previous_name: current.display_name,
      new_name: displayName,
      ...(roleLabel !== undefined
        ? {
            previous_role_label: current.role_label ?? '',
            new_role_label: roleLabel,
          }
        : {}),
      ...(superseded
        ? {
            superseded_request_id: superseded.id,
            superseded_requested_name: superseded.requested_name,
          }
        : {}),
    },
  })

  return Response.json({
    profile: { displayName, roleLabel: roleLabel ?? session.profile.role_label },
  })
}
