import { z } from 'zod'

import { audit } from '@/lib/audit/audit'
import {
  authIpLimiter,
  authLimiter,
  clientIp,
  rateLimitResponse,
} from '@/lib/auth/rate-limit'
import { serviceClient } from '@/lib/supabase/service-client'
import { userClient } from '@/lib/supabase/user-client'
import type { ProfileRow } from '@/lib/types'

/** POST /api/auth/login (M3-04). Rate-limited per email AND per IP. */

const bodySchema = z.object({
  email: z.email(),
  password: z.string().min(1),
})

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ error: 'invalid credentials' }, { status: 400 })
  }
  const { email, password } = parsed.data

  if (
    !authLimiter.check(`login:${email.toLowerCase()}`) ||
    !authIpLimiter.check(`login:${clientIp(request)}`)
  ) {
    return rateLimitResponse()
  }

  const supabase = await userClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error || !data.user) {
    // Uniform message: no user-enumeration oracle.
    return Response.json({ error: 'invalid credentials' }, { status: 401 })
  }

  // Audit the login into the user's workspaces (usually one in the pilot).
  const service = serviceClient()
  const { data: profileData } = await service
    .from('profiles')
    .select('workspace_id, display_name')
    .eq('user_id', data.user.id)

  const profiles = (profileData ?? []) as Pick<
    ProfileRow,
    'workspace_id' | 'display_name'
  >[]
  for (const profile of profiles) {
    await audit(service, {
      workspaceId: profile.workspace_id,
      actorId: data.user.id,
      actorDisplayName: profile.display_name,
      eventType: 'auth.login',
    })
  }

  return Response.json({ ok: true })
}
