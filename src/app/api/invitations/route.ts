import { z } from 'zod'

import { audit } from '@/lib/audit/audit'
import { getSession } from '@/lib/auth/session'
import { authorize } from '@/lib/authz/authorize'
import { sendEmail } from '@/lib/email/send'
import { publicEnv } from '@/lib/env/public'
import { serverEnv } from '@/lib/env/server'
import {
  generateInviteToken,
  hashInviteToken,
  inviteExpiry,
} from '@/lib/invites/token'
import { serviceClient } from '@/lib/supabase/service-client'

/**
 * POST /api/invitations (M4-04) — admin issues an invitation.
 *
 * I2 lands here: display_name (and nickname/role_label) are fixed BY THE
 * ADMIN at invite time. The accept flow (M4-05) never offers a field to
 * change them.
 *
 * Token lifecycle: 32 random bytes → the raw token goes into the emailed
 * link and NOWHERE else; the row stores its SHA-256. Re-inviting the same
 * email expires any previous pending invitation first, so exactly one link
 * works per person per workspace at any time. Seven days, single use.
 */

const bodySchema = z.object({
  email: z.email(),
  displayName: z.string().trim().min(1).max(60),
  nickname: z.string().trim().min(1).max(60).optional(),
  role: z.enum(['admin', 'member', 'client']).default('member'),
  roleLabel: z.string().trim().max(60).optional(),
  /** Optional: group the invitee joins on accept (must be active, this workspace). */
  groupId: z.uuid().optional(),
})

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
  const { email, displayName, nickname, role, roleLabel, groupId } = parsed.data

  const service = serviceClient()
  const authz = await authorize(service, session.userId, {
    workspaceId,
    // When the invite targets a group, resolving it through authorize()
    // also gives us the cross-tenant 404 for free.
    groupId,
    action: 'invite.create',
  })
  if (!authz.ok) {
    return Response.json({ error: authz.reason }, { status: authz.status })
  }
  if (authz.group && authz.group.status !== 'active') {
    return Response.json(
      { error: `group is ${authz.group.status} and read-only (I3)` },
      { status: 403 },
    )
  }

  // One live link per invitee: expire any pending invitation for this email.
  await service
    .from('invitations')
    .update({ expires_at: new Date().toISOString() })
    .eq('workspace_id', workspaceId)
    .eq('email', email.toLowerCase())
    .is('accepted_at', null)
    .gt('expires_at', new Date().toISOString())

  const rawToken = generateInviteToken()

  const { data, error } = await service
    .from('invitations')
    .insert({
      workspace_id: workspaceId,
      group_id: groupId ?? null,
      email: email.toLowerCase(),
      display_name: displayName,
      nickname: nickname ?? null,
      member_role: role,
      role_label: roleLabel ?? '',
      token_hash: hashInviteToken(rawToken),
      expires_at: inviteExpiry(),
      created_by: session.userId,
    })
    .select('id, expires_at')
    .single()

  if (error) {
    return Response.json({ error: 'invitation failed' }, { status: 500 })
  }

  const inviteUrl = `${publicEnv.NEXT_PUBLIC_APP_URL}/invite/${rawToken}`

  const { data: workspace } = await service
    .from('workspaces')
    .select('name')
    .eq('id', workspaceId)
    .single()
  const workspaceName = (workspace?.name as string | undefined) ?? 'a workspace'

  const { delivered } = await sendEmail({
    to: email,
    subject: `You're invited to join ${workspaceName} on Confide`,
    text:
      `${session.profile.display_name} invited you to join ${workspaceName} on Confide.\n\n` +
      `You'll join as "${displayName}"${roleLabel ? ` (${roleLabel})` : ''}.\n\n` +
      `Accept your invitation (valid 7 days, single use):\n${inviteUrl}\n\n` +
      `If you weren't expecting this, you can ignore this email.`,
  })

  await audit(service, {
    workspaceId,
    actorId: session.userId,
    actorDisplayName: session.profile.display_name,
    groupId: groupId ?? null,
    groupName: authz.group?.name,
    eventType: 'invite.created',
    // The raw token must never appear here — the audit log is readable by
    // every admin and lives forever.
    payload: { email: email.toLowerCase(), member_role: role, invitation_id: data.id },
  })

  return Response.json(
    {
      invitation: { id: data.id, email: email.toLowerCase(), expiresAt: data.expires_at },
      emailDelivered: delivered,
      // Dev convenience ONLY: with no email provider configured the link
      // would otherwise be unreachable. Never present in production.
      ...(serverEnv.NODE_ENV !== 'production' && !delivered
        ? { devInviteUrl: inviteUrl }
        : {}),
    },
    { status: 201 },
  )
}
