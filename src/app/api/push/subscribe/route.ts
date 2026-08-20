import { z } from 'zod'

import { getSession } from '@/lib/auth/session'
import { serviceClient } from '@/lib/supabase/service-client'

/**
 * Push subscription registry (Tier 2).
 *
 * POST saves this browser's push subscription for the caller; DELETE
 * removes it (notifications toggled off, or logout). Endpoints are
 * capability URLs, so the table is service-role-only (RLS deny-all) and
 * every row is scoped to the session's user — one user cannot register
 * a subscription under another's name.
 */

const subscriptionSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({
    p256dh: z.string().min(1).max(300),
    auth: z.string().min(1).max(100),
  }),
})

export async function POST(request: Request) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }

  const parsed = subscriptionSchema.safeParse(
    await request.json().catch(() => null),
  )
  if (!parsed.success) {
    return Response.json({ error: 'invalid subscription' }, { status: 400 })
  }

  const service = serviceClient()
  const { error } = await service.from('push_subscriptions').upsert(
    {
      workspace_id: session.profile.workspace_id,
      user_id: session.userId,
      endpoint: parsed.data.endpoint,
      p256dh: parsed.data.keys.p256dh,
      auth: parsed.data.keys.auth,
    },
    { onConflict: 'endpoint' },
  )
  if (error) {
    return Response.json({ error: 'could not save subscription' }, { status: 500 })
  }
  return Response.json({ subscribed: true }, { status: 201 })
}

export async function DELETE(request: Request) {
  const session = await getSession()
  if (!session) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }

  const parsed = z
    .object({ endpoint: z.url().max(1000) })
    .safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'invalid endpoint' }, { status: 400 })
  }

  const service = serviceClient()
  await service
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', parsed.data.endpoint)
    .eq('user_id', session.userId)
  return Response.json({ subscribed: false })
}
