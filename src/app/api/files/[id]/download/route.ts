import { z } from 'zod'

import { getSession } from '@/lib/auth/session'
import { authorize } from '@/lib/authz/authorize'
import { serviceClient } from '@/lib/supabase/service-client'

/**
 * GET /api/files/:id/download (M7-01) — mint a 5-minute signed URL.
 *
 * Every download re-checks authorize() at request time, which is what makes
 * member removal REAL for files: the moment removed_at is set, this route
 * 404s and no long-lived link exists to keep working (URLs die in 300s).
 *
 * Visibility mirrors the message policy: a file on a PENDING message is
 * reachable only by its sender and moderators; recipients get it when the
 * message is delivered. Anything not scanned 'clean'/'skipped' stays
 * locked (M7-03).
 */

const idSchema = z.uuid()
const SIGNED_URL_TTL_SECONDS = 300

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }
  const workspaceId = session.profile.workspace_id

  const { id } = await params
  if (!idSchema.safeParse(id).success) {
    return Response.json({ error: 'file not found' }, { status: 404 })
  }

  const service = serviceClient()
  const { data: file } = await service
    .from('files')
    .select('workspace_id, group_id, message_id, uploader_id, storage_path, scan_status, name')
    .eq('id', id)
    .maybeSingle()

  if (!file || file.workspace_id !== workspaceId) {
    return Response.json({ error: 'file not found' }, { status: 404 })
  }

  const authz = await authorize(service, session.userId, {
    workspaceId,
    groupId: file.group_id as string,
    action: 'group.read',
  })
  if (!authz.ok) {
    return Response.json({ error: authz.reason }, { status: authz.status })
  }

  // Scan gate (M7-03): pending or infected files are locked for everyone.
  if (file.scan_status !== 'clean' && file.scan_status !== 'skipped') {
    return Response.json(
      { error: `file is not available (scan ${file.scan_status})` },
      { status: 423 },
    )
  }

  // Held-message gate: mirrors the messages RLS policy.
  if (file.message_id) {
    const { data: message } = await service
      .from('messages')
      .select('status, sender_id')
      .eq('id', file.message_id as string)
      .single()
    const isModerator =
      authz.role === 'admin' || authz.groupRole === 'manager'
    const isSender = message?.sender_id === session.userId
    if (message?.status !== 'delivered' && !isSender && !isModerator) {
      return Response.json({ error: 'file not found' }, { status: 404 })
    }
  }

  const { data: signed, error } = await service.storage
    .from('files')
    .createSignedUrl(file.storage_path as string, SIGNED_URL_TTL_SECONDS, {
      download: file.name as string,
    })

  if (error || !signed) {
    return Response.json({ error: 'could not sign the download' }, { status: 500 })
  }

  return Response.json({
    url: signed.signedUrl,
    expiresIn: SIGNED_URL_TTL_SECONDS,
  })
}
