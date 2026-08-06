import { z } from 'zod'

import { audit } from '@/lib/audit/audit'
import {
  authIpLimiter,
  clientIp,
  rateLimitResponse,
} from '@/lib/auth/rate-limit'
import { serviceClient } from '@/lib/supabase/service-client'
import { userClient } from '@/lib/supabase/user-client'

/**
 * POST /api/auth/signup (M3-03): create account + workspace. The first user
 * of a workspace becomes its Admin (spec §7).
 *
 * The workspace bootstrap is a single RPC transaction — workspace, admin
 * profile, default visibility rules, audit entry all-or-nothing. An auth user
 * whose RPC fails simply has no workspace yet; nothing dangling to clean up.
 */

const bodySchema = z.object({
  email: z.email(),
  password: z.string().min(10, 'password must be at least 10 characters'),
  workspaceName: z.string().trim().min(2).max(80),
  displayName: z.string().trim().min(1).max(60),
})

export async function POST(request: Request) {
  if (!authIpLimiter.check(`signup:${clientIp(request)}`)) {
    return rateLimitResponse()
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'invalid input' },
      { status: 400 },
    )
  }
  const { email, password, workspaceName, displayName } = parsed.data

  // Sign up via the SSR client so the session cookies land on this response.
  const supabase = await userClient()
  const { data, error } = await supabase.auth.signUp({ email, password })

  if (error) {
    return Response.json({ error: error.message }, { status: 400 })
  }
  if (!data.user) {
    return Response.json({ error: 'signup failed' }, { status: 500 })
  }

  const service = serviceClient()
  const { data: workspaceId, error: rpcError } = await service.rpc(
    'create_workspace_with_admin',
    {
      p_user_id: data.user.id,
      p_workspace_name: workspaceName,
      p_display_name: displayName,
    },
  )

  if (rpcError) {
    return Response.json(
      { error: 'workspace creation failed, please retry' },
      { status: 500 },
    )
  }

  // workspace.created is audited inside the RPC; record the signup itself too.
  await audit(service, {
    workspaceId: workspaceId as string,
    actorId: data.user.id,
    actorDisplayName: displayName,
    eventType: 'auth.signup',
    payload: { email_domain: email.split('@')[1] ?? '' },
  })

  return Response.json({ workspaceId }, { status: 201 })
}
