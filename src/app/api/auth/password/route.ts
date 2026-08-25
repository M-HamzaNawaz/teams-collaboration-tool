import { z } from 'zod'

import { audit } from '@/lib/audit/audit'
import { serviceClient } from '@/lib/supabase/service-client'
import { userClient } from '@/lib/supabase/user-client'
import type { ProfileRow } from '@/lib/types'

/**
 * POST /api/auth/password — set a new password, and RECORD that it happened.
 *
 * This route exists for the audit entry. The reset page used to call
 * supabase.auth.updateUser() straight from the browser, so a credential
 * change was the one identity event that touched no server and left no
 * trace: auth.login and auth.logout were in the log, the password change
 * that sat between them was not. For a product whose deliverable is a
 * permanent evidentiary trail, "who could have been in this account, and
 * from when" has to be answerable.
 *
 * Audited per workspace, like auth.login (M3-04): a password recovery link
 * signs the user in before any workspace is chosen, so there is no active
 * workspace context to read — the profile rows ARE the answer to "whose
 * record does this belong in".
 *
 * The audit write throws on failure, which surfaces as a 500 AFTER the
 * password already changed. That is the house rule (lib/audit/audit.ts):
 * a mutation that succeeded without being recorded must be loud.
 */

const bodySchema = z.object({
  // Matches signup (M3-04); this is the same credential, set a second time.
  password: z.string().min(10, 'password must be at least 10 characters'),
})

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? 'invalid input' },
      { status: 400 },
    )
  }

  // getUser(), not getSession(): a recovery link authenticates the user
  // without selecting a workspace, so the session helper's profile lookup
  // would come back empty and 401 a legitimate reset.
  const supabase = await userClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'authentication required' }, { status: 401 })
  }

  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  })
  if (error) {
    return Response.json({ error: error.message }, { status: 400 })
  }

  const service = serviceClient()
  const { data: profileData } = await service
    .from('profiles')
    .select('workspace_id, display_name')
    .eq('user_id', user.id)

  const profiles = (profileData ?? []) as Pick<
    ProfileRow,
    'workspace_id' | 'display_name'
  >[]
  for (const profile of profiles) {
    await audit(service, {
      workspaceId: profile.workspace_id,
      actorId: user.id,
      actorDisplayName: profile.display_name,
      eventType: 'auth.password_changed',
    })
  }

  return Response.json({ ok: true })
}
