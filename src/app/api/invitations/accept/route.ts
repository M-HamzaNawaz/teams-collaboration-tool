import { cookies } from 'next/headers'
import { z } from 'zod'

import { getSession, ACTIVE_WORKSPACE_COOKIE } from '@/lib/auth/session'
import {
  authLimiter,
  clientIp,
  rateLimitResponse,
} from '@/lib/auth/rate-limit'
import { CONSENT_DOC_VERSION } from '@/lib/invites/consent'
import { hashInviteToken } from '@/lib/invites/token'
import { serviceClient } from '@/lib/supabase/service-client'
import { userClient } from '@/lib/supabase/user-client'

/**
 * POST /api/invitations/accept (M4-05).
 *
 * Two shapes of caller:
 *   - New email → `password` required; we create the auth account (GoTrue
 *     hashes it), then run the atomic accept RPC, then sign them in so the
 *     response carries session cookies.
 *   - Existing account → they must ALREADY be signed in as that account
 *     (the link alone must not grant access to someone else's session).
 *     Not signed in → 409 requiresLogin, the page bounces via /login and
 *     returns here. Then the RPC links a second profile — no duplicate
 *     user, zero data crossover between workspaces (spec §6 edge case).
 *
 * Everything past account creation is public.accept_invitation() — one
 * transaction for profile + group membership + consent (M4-06) + token burn
 * + audit. Rate-limited: the token IS the credential, no brute-forcing it.
 */

const bodySchema = z.object({
  token: z.string().min(20).max(200),
  password: z.string().min(10).optional(),
  consent: z.literal(true),
})

export async function POST(request: Request) {
  if (!authLimiter.check(`invite-accept:${clientIp(request)}`)) {
    return rateLimitResponse()
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'invalid input' },
      { status: 400 },
    )
  }
  const { token, password } = parsed.data
  const tokenHash = hashInviteToken(token)

  const service = serviceClient()

  // Validate the invitation BEFORE any account is created.
  const { data: invitation } = await service
    .from('invitations')
    .select('email, accepted_at, expires_at')
    .eq('token_hash', tokenHash)
    .maybeSingle()

  const valid =
    invitation &&
    invitation.accepted_at === null &&
    new Date(invitation.expires_at as string) > new Date()
  if (!valid) {
    return Response.json(
      { error: 'invitation is invalid or has expired' },
      { status: 410 },
    )
  }
  const email = (invitation.email as string).toLowerCase()

  // Existing account? (public.users mirrors auth.users.)
  const { data: existingUser } = await service
    .from('users')
    .select('id')
    .ilike('email', email)
    .maybeSingle()

  let userId: string

  if (existingUser) {
    const session = await getSession()
    if (!session || session.email?.toLowerCase() !== email) {
      // Someone holds a valid link for an existing account but isn't signed
      // in as it. The link must not become a session-stealing device.
      return Response.json(
        { requiresLogin: true, email },
        { status: 409 },
      )
    }
    userId = session.userId
  } else {
    if (!password) {
      return Response.json(
        { error: 'password is required (min 10 characters)' },
        { status: 400 },
      )
    }
    const { data: created, error: createError } =
      await service.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // reaching the emailed link proves the inbox
      })
    if (createError || !created.user) {
      return Response.json({ error: 'account creation failed' }, { status: 500 })
    }
    userId = created.user.id
  }

  // consents.ip is inet — pass null rather than the 'unknown' sentinel.
  const ip = clientIp(request)
  const { data: workspaceId, error: rpcError } = await service.rpc(
    'accept_invitation',
    {
      p_token_hash: tokenHash,
      p_user_id: userId,
      p_doc_version: CONSENT_DOC_VERSION,
      p_ip: ip === 'unknown' ? null : ip,
      p_user_agent: request.headers.get('user-agent') ?? '',
    },
  )

  if (rpcError) {
    // Postgres error strings from the RPC are written to be user-safe.
    const message = rpcError.message.includes('invitation')
      ? rpcError.message
      : rpcError.message.includes('already a member')
        ? 'already a member of this workspace'
        : rpcError.message.includes('different email')
          ? 'invitation was issued to a different email'
          : 'acceptance failed'
    const status = message === 'acceptance failed' ? 500 : 409
    return Response.json({ error: message }, { status })
  }

  // New account: sign in now so the response sets session cookies.
  if (!existingUser && password) {
    const supabase = await userClient()
    await supabase.auth.signInWithPassword({ email, password })
  }

  // Land them in the workspace they just joined, not their oldest one.
  const cookieStore = await cookies()
  cookieStore.set(ACTIVE_WORKSPACE_COOKIE, workspaceId as string, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
  })

  return Response.json({ workspaceId }, { status: 201 })
}
