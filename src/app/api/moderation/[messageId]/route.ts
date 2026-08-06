import { z } from 'zod'

import { getSession } from '@/lib/auth/session'
import { authorize } from '@/lib/authz/authorize'
import { serviceClient } from '@/lib/supabase/service-client'

/**
 * POST /api/moderation/:messageId (M6-02) — approve or block a held message.
 *
 * authorize(message.moderate) settles WHO may act (admin anywhere, manager
 * in their group); resolve_message() makes the act atomic — status flip,
 * flag resolution, audit entry, one transaction. Approval's status UPDATE
 * is the delivery (RLS + Realtime, M5-02); a block's UPDATE reaches only
 * the sender, whose bubble turns into the workspace-policy notice (M5-05).
 */

const idSchema = z.uuid()
const bodySchema = z.object({
  decision: z.enum(['approved', 'blocked']),
})

export async function POST(
  request: Request,
  { params }: { params: Promise<{ messageId: string }> },
) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }
  const workspaceId = session.profile.workspace_id

  const { messageId } = await params
  if (!idSchema.safeParse(messageId).success) {
    return Response.json({ error: 'message not found' }, { status: 404 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json(
      { error: "decision must be 'approved' or 'blocked'" },
      { status: 400 },
    )
  }

  const service = serviceClient()

  // Resolve the message's group for the authorize() check. Cross-tenant
  // probes and unknown ids share one 404.
  const { data: message } = await service
    .from('messages')
    .select('group_id, workspace_id, status')
    .eq('id', messageId)
    .maybeSingle()

  if (!message || message.workspace_id !== workspaceId) {
    return Response.json({ error: 'message not found' }, { status: 404 })
  }

  const authz = await authorize(service, session.userId, {
    workspaceId,
    groupId: message.group_id as string,
    action: 'message.moderate',
  })
  if (!authz.ok) {
    return Response.json({ error: authz.reason }, { status: authz.status })
  }

  const { data, error } = await service.rpc('resolve_message', {
    p_message_id: messageId,
    p_decision: parsed.data.decision,
    p_actor_id: session.userId,
    p_actor_display_name: session.profile.display_name,
  })

  if (error) {
    if (error.message.includes('not pending')) {
      // Double-click / already handled by someone else.
      return Response.json(
        { error: 'message is no longer pending review' },
        { status: 409 },
      )
    }
    return Response.json({ error: 'resolution failed' }, { status: 500 })
  }

  return Response.json({ resolved: data })
}
