import { audit } from '@/lib/audit/audit'
import { getSession } from '@/lib/auth/session'
import { serviceClient } from '@/lib/supabase/service-client'
import { userClient } from '@/lib/supabase/user-client'

/** POST /api/auth/logout (M3-04). Audited before the session is torn down. */

export async function POST() {
  const session = await getSession()

  if (session) {
    await audit(serviceClient(), {
      workspaceId: session.profile.workspace_id,
      actorId: session.userId,
      actorDisplayName: session.profile.display_name,
      eventType: 'auth.logout',
    })
  }

  const supabase = await userClient()
  await supabase.auth.signOut()

  return Response.json({ ok: true })
}
