import { cookies } from 'next/headers'
import { z } from 'zod'

import { ACTIVE_WORKSPACE_COOKIE, getSession } from '@/lib/auth/session'

/**
 * POST /api/workspace/switch — change the caller's active workspace.
 *
 * Validated against the caller's OWN profiles (getSession reads them under
 * their identity), so the cookie can never point at a workspace they don't
 * belong to. Everything downstream — RLS, authorize(), masking — keys off
 * session.profile, so a forged cookie value would simply be rejected here
 * and never reach them.
 */

const bodySchema = z.object({ workspaceId: z.uuid() })

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'workspaceId required' }, { status: 400 })
  }

  const member = session.profiles.some(
    (profile) => profile.workspace_id === parsed.data.workspaceId,
  )
  if (!member) {
    // Not a member — indistinguishable from a workspace that doesn't exist.
    return Response.json({ error: 'workspace not found' }, { status: 404 })
  }

  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, parsed.data.workspaceId, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
  })

  return Response.json({ workspaceId: parsed.data.workspaceId })
}
