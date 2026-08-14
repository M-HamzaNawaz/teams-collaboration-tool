import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import { getSession } from '@/lib/auth/session'
import { createRateLimiter, rateLimitResponse } from '@/lib/auth/rate-limit'
import { authorize } from '@/lib/authz/authorize'
import { detect, type DetectionConfig } from '@/lib/detection'
import { resolveGroupSettings } from '@/lib/groups/settings'
import { scanner } from '@/lib/files/scanner'
import { serviceClient } from '@/lib/supabase/service-client'

/**
 * POST /api/files (M7-02) — upload, as multipart form data (file, groupId).
 *
 * The FILENAME runs through detect() and the verdict holds or delivers the
 * carrying message exactly like message text — call-me-+923001234567.pdf
 * waits in the moderation queue like any other contact-info attempt. File
 * CONTENTS are not scanned in v1 (accepted gap, TECHNICAL_PLAN §10);
 * the virus-scan seam (M7-03) runs before the rows are written.
 *
 * Object path: workspace/group/uuid/filename in the PRIVATE 'files' bucket.
 * Nothing about the path is guessable or publicly addressable.
 */

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024 // 50 MB, workspace-configurable

const groupIdSchema = z.uuid()

/** 20 uploads per minute per user. */
const uploadLimiter = createRateLimiter({ windowMs: 60_000, max: 20 })

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }
  const workspaceId = session.profile.workspace_id

  if (!uploadLimiter.check(`upload:${session.userId}`)) {
    return rateLimitResponse()
  }

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  const groupId = form?.get('groupId')
  if (
    !(file instanceof File) ||
    typeof groupId !== 'string' ||
    !groupIdSchema.safeParse(groupId).success
  ) {
    return Response.json(
      { error: 'multipart form with file and groupId required' },
      { status: 400 },
    )
  }

  const service = serviceClient()
  const authz = await authorize(service, session.userId, {
    workspaceId,
    groupId,
    action: 'group.write',
  })
  if (!authz.ok) {
    return Response.json({ error: authz.reason }, { status: authz.status })
  }

  // Per-group rules: a group may forbid uploads outright, or skip filename
  // scanning. Neither can disable the audit entry or the virus-scan seam.
  const { data: ws } = await service
    .from('workspaces')
    .select('settings_jsonb')
    .eq('id', workspaceId)
    .single()
  const groupRules = resolveGroupSettings(
    authz.group?.settings_jsonb,
    (ws?.settings_jsonb as { moderation?: unknown } | null)?.moderation,
  )
  if (!groupRules.allowFiles) {
    return Response.json(
      { error: 'file sharing is turned off for this group' },
      { status: 403 },
    )
  }

  // Workspace-configurable size ceiling.
  const maxBytes =
    ((ws?.settings_jsonb as { files?: { max_bytes?: number } } | null)?.files
      ?.max_bytes as number | undefined) ?? DEFAULT_MAX_BYTES
  if (file.size > maxBytes) {
    return Response.json(
      { error: `file exceeds the ${Math.floor(maxBytes / 1024 / 1024)} MB limit` },
      { status: 413 },
    )
  }
  if (file.size === 0) {
    return Response.json({ error: 'file is empty' }, { status: 400 })
  }

  const filename = (file.name || 'file').slice(0, 255)

  // The load-bearing line, same as the text path: filename through detect().
  const detectionSettings = (
    ws?.settings_jsonb as { detection?: Partial<DetectionConfig> } | null
  )?.detection
  const verdict = groupRules.scanFilenames
    ? detect(filename, detectionSettings)
    : { action: 'allow' as const, findings: [] }

  const bytes = await file.arrayBuffer()
  const scanStatus = await scanner.scan({
    name: filename,
    mime: file.type || 'application/octet-stream',
    bytes,
  })
  if (scanStatus === 'infected') {
    return Response.json(
      { error: 'file failed the malware scan' },
      { status: 422 },
    )
  }

  const storagePath = `${workspaceId}/${groupId}/${randomUUID()}/${filename}`
  const { error: uploadError } = await service.storage
    .from('files')
    .upload(storagePath, bytes, {
      contentType: file.type || 'application/octet-stream',
    })
  if (uploadError) {
    return Response.json({ error: 'upload failed' }, { status: 500 })
  }

  const { data, error } = await service.rpc('send_file_message', {
    p_workspace_id: workspaceId,
    p_group_id: groupId,
    p_sender_id: session.userId,
    p_sender_display_name: session.profile.display_name,
    p_group_name: authz.group?.name ?? '',
    p_filename: filename,
    p_action: verdict.action,
    p_findings: verdict.findings,
    p_mime: file.type || 'application/octet-stream',
    p_size_bytes: file.size,
    p_storage_path: storagePath,
    p_scan_status: scanStatus,
  })

  if (error) {
    // The object must not outlive a failed row write.
    await service.storage.from('files').remove([storagePath])
    return Response.json({ error: 'upload failed' }, { status: 500 })
  }

  const result = data as {
    id: string
    status: 'pending' | 'delivered'
    created_at: string
    file_id: string
  }

  return Response.json(
    {
      message: {
        id: result.id,
        status: result.status,
        createdAt: result.created_at,
        fileId: result.file_id,
        fileName: filename,
      },
    },
    { status: 201 },
  )
}
