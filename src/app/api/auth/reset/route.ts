import { z } from 'zod'

import {
  clientIp,
  rateLimitResponse,
  resetLimiter,
} from '@/lib/auth/rate-limit'
import { publicEnv } from '@/lib/env/public'
import { userClient } from '@/lib/supabase/user-client'

/**
 * POST /api/auth/reset (M3-04): request a password-reset email.
 *
 * Always 200 regardless of whether the email exists — the response must not
 * be an account-enumeration oracle. Supabase makes the token single-use with
 * a bounded lifetime; the email link lands on /reset where the user sets the
 * new password.
 */

const bodySchema = z.object({ email: z.email() })

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json({ ok: true })
  }
  const email = parsed.data.email.toLowerCase()

  if (
    !resetLimiter.check(`reset:${email}`) ||
    !resetLimiter.check(`reset:${clientIp(request)}`)
  ) {
    return rateLimitResponse()
  }

  const supabase = await userClient()
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/reset`,
  })

  return Response.json({ ok: true })
}
