import { getSession } from '@/lib/auth/session'
import { buildModerationQueue } from '@/lib/moderation/queue'

/**
 * GET /api/moderation/queue (M6-01).
 *
 * Thin wrapper over buildModerationQueue — the server page calls the same
 * builder to seed the client, so both surfaces always agree. This is a
 * moderator surface: it returns held content and detection findings — the
 * one audience findings are FOR.
 */
export async function GET() {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }
  const result = await buildModerationQueue(session)
  if (!result.ok) {
    return Response.json({ error: result.error }, { status: result.status })
  }
  return Response.json({ queue: result.queue })
}
