import { z } from 'zod'

import { audit } from '@/lib/audit/audit'
import { getSession } from '@/lib/auth/session'
import { authorize } from '@/lib/authz/authorize'
import { serviceClient } from '@/lib/supabase/service-client'
import type { GroupRow } from '@/lib/types'

/**
 * PATCH /api/groups/:id/settings — change a group's screening rules.
 *
 * These were settable only at creation, so an admin who wanted a stricter
 * room after the fact had no way to say so from the product; the setting
 * existed and the control did not. Everything here already changes behaviour
 * in the write path (lib/groups/settings) — there are no decorative
 * switches, and nothing here can turn detection or the audit trail off.
 *
 * Admin-only via workspace.manage, which also resolves the group and proves
 * it belongs to the caller's workspace before anything is written.
 *
 * MERGES rather than replaces: settings_jsonb carries keys this route does
 * not model (escalate_minutes, auto_approve_hours), and a PATCH that
 * silently dropped a group's escalation timer would be a quiet way to make
 * held messages sit forever.
 */

const idSchema = z.uuid()

const bodySchema = z.object({
  /**
   * Hold any digit run this long. null clears it (back to layered detection
   * only). 1 really does mean any digit — that is a legitimate ask for a
   * client room, and it holds roughly two thirds of ordinary chat.
   */
  holdNumbersMinDigits: z.number().int().min(1).max(20).nullable().optional(),
  /** false → contact info delivers immediately, still flagged and audited. */
  holdContactInfo: z.boolean().optional(),
})

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }

  const { id } = await params
  if (!idSchema.safeParse(id).success) {
    return Response.json({ error: 'group not found' }, { status: 404 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'invalid input' },
      { status: 400 },
    )
  }

  const service = serviceClient()
  const authz = await authorize(service, session.userId, {
    workspaceId: session.profile.workspace_id,
    groupId: id,
    action: 'workspace.manage',
  })
  if (!authz.ok) {
    return Response.json({ error: authz.reason }, { status: authz.status })
  }

  const current = (authz.group?.settings_jsonb ?? {}) as Record<string, unknown>
  const next: Record<string, unknown> = { ...current }

  if ('holdNumbersMinDigits' in parsed.data) {
    if (parsed.data.holdNumbersMinDigits === null) {
      delete next.hold_numbers_min_digits
    } else {
      next.hold_numbers_min_digits = parsed.data.holdNumbersMinDigits
    }
  }
  if (parsed.data.holdContactInfo !== undefined) {
    next.hold_contact_info = parsed.data.holdContactInfo
  }

  const { data, error } = await service
    .from('groups')
    .update({ settings_jsonb: next })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    return Response.json({ error: 'update failed' }, { status: 500 })
  }
  const group = data as GroupRow

  // The before AND after are recorded: "who made this room stricter, and
  // when" is exactly the question an audit trail should answer, and a
  // loosening is the one worth being able to point at later.
  await audit(service, {
    workspaceId: group.workspace_id,
    actorId: session.userId,
    actorDisplayName: session.profile.display_name,
    groupId: group.id,
    groupName: group.name,
    eventType: 'group.settings_changed',
    payload: { from: current, to: next },
  })

  return Response.json({ group })
}
