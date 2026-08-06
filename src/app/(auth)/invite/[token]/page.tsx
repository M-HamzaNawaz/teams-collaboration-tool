import { CONSENT_DOC_TEXT } from '@/lib/invites/consent'
import { hashInviteToken } from '@/lib/invites/token'
import { serviceClient } from '@/lib/supabase/service-client'

import { AuthShell } from '../../auth-ui'
import { AcceptForm } from './accept-form'

/**
 * /invite/[token] (M4-05) — the invitee's landing page. Public route (the
 * token is the credential); everything here is a server-side lookup, so an
 * invalid link renders a dead end without leaking whether it ever existed.
 *
 * I2 on screen: the display name and role label are shown as FACTS of the
 * invitation ("You'll join as …") — there is no input to change them, and
 * the accept API reads them from the invitation row, not from the client.
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params

  const service = serviceClient()
  const { data: invitation } = await service
    .from('invitations')
    .select('email, display_name, role_label, expires_at, accepted_at, workspace_id')
    .eq('token_hash', hashInviteToken(token))
    .maybeSingle()

  const valid =
    invitation &&
    invitation.accepted_at === null &&
    new Date(invitation.expires_at as string) > new Date()

  if (!valid) {
    return (
      <AuthShell
        title="Invitation not available"
        subtitle="This link is invalid, already used, or has expired. Ask your workspace admin to send a new invitation."
      >
        <p className="text-center text-sm text-muted">
          Already a member?{' '}
          <a href="/login" className="underline hover:text-foreground">
            Sign in
          </a>
        </p>
      </AuthShell>
    )
  }

  const [{ data: workspace }, { data: existingUser }] = await Promise.all([
    service
      .from('workspaces')
      .select('name')
      .eq('id', invitation.workspace_id as string)
      .single(),
    service
      .from('users')
      .select('id')
      .ilike('email', (invitation.email as string).toLowerCase())
      .maybeSingle(),
  ])

  const workspaceName = (workspace?.name as string) ?? 'a workspace'

  return (
    <AuthShell
      title={`Join ${workspaceName}`}
      subtitle="Review the terms below to accept your invitation"
      maxWidth="lg"
    >
      <AcceptForm
        token={token}
        email={(invitation.email as string).toLowerCase()}
        displayName={invitation.display_name as string}
        roleLabel={(invitation.role_label as string) || null}
        workspaceName={workspaceName}
        needsAccount={!existingUser}
        consentText={CONSENT_DOC_TEXT}
      />
    </AuthShell>
  )
}
