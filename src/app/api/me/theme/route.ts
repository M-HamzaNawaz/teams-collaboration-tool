import { z } from 'zod'

import { getSession } from '@/lib/auth/session'
import { serviceClient } from '@/lib/supabase/service-client'
import { isValidTheme } from '@/lib/theme/themes'

/**
 * PATCH /api/me/theme — save the caller's color theme on their profile in
 * the active workspace. A personal preference open to every role (unlike
 * display name, which only the admin edits); the value is validated against
 * the known theme ids, so nothing arbitrary lands in the column.
 */
const bodySchema = z.object({ theme: z.string() })

export async function PATCH(request: Request) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success || !isValidTheme(parsed.data.theme)) {
    return Response.json({ error: 'unknown theme' }, { status: 400 })
  }

  const { error } = await serviceClient()
    .from('profiles')
    .update({ theme: parsed.data.theme })
    .eq('workspace_id', session.profile.workspace_id)
    .eq('user_id', session.userId)

  if (error) {
    return Response.json({ error: 'could not save theme' }, { status: 500 })
  }
  return Response.json({ ok: true })
}
