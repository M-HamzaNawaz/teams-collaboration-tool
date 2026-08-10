'use client'

import { useState } from 'react'

/**
 * Invite someone into the workspace (M4-04's UI).
 *
 * I2 is visible here: the ADMIN types the display name and role — the
 * invitee never gets a field to change either, so a client can't rename
 * themselves into a contact card. The form says so out loud.
 *
 * After issuing, the link is shown for copying: in production Resend has
 * already emailed it, but handing the admin a copyable link covers the
 * "email went to spam" case that would otherwise stall onboarding.
 */

type Result = {
  email: string
  expiresAt: string
  emailDelivered: boolean
  url?: string
}

export function InviteDialog(props: {
  /** When set, the invitee joins this group on acceptance. */
  groupId?: string
  groupName?: string
  onClose: () => void
  onInvited?: () => void
}) {
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<'member' | 'client' | 'admin'>('member')
  const [roleLabel, setRoleLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<Result | null>(null)
  const [copied, setCopied] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)

    const response = await fetch('/api/invitations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim(),
        displayName: displayName.trim(),
        role,
        ...(roleLabel.trim() ? { roleLabel: roleLabel.trim() } : {}),
        ...(props.groupId ? { groupId: props.groupId } : {}),
      }),
    })
    const data = (await response.json().catch(() => null)) as
      | {
          invitation?: { email: string; expiresAt: string }
          emailDelivered?: boolean
          devInviteUrl?: string
          error?: string
        }
      | null

    if (response.status === 201 && data?.invitation) {
      setResult({
        email: data.invitation.email,
        expiresAt: data.invitation.expiresAt,
        emailDelivered: !!data.emailDelivered,
        url: data.devInviteUrl,
      })
      props.onInvited?.()
    } else {
      setError(data?.error ?? 'could not send the invitation')
    }
    setBusy(false)
  }

  function inviteAnother() {
    setResult(null)
    setEmail('')
    setDisplayName('')
    setRoleLabel('')
    setCopied(false)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={props.onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl"
      >
        <header className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold">
              {result ? 'Invitation sent' : 'Invite someone'}
            </h2>
            <p className="text-sm text-muted">
              {props.groupName
                ? `They'll join ${props.groupName} when they accept.`
                : 'They join the workspace when they accept.'}
            </p>
          </div>
          <button
            onClick={props.onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 hover:bg-surface-2"
          >
            ✕
          </button>
        </header>

        {result ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm">
              <span className="font-medium">{result.email}</span> can join for
              the next 7 days.
            </p>
            <p className="text-sm text-muted">
              {result.emailDelivered
                ? '📧 The invitation email is on its way.'
                : 'Email is not configured here — share this link directly:'}
            </p>
            {result.url && (
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={result.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 font-mono text-xs"
                />
                <button
                  onClick={async () => {
                    await navigator.clipboard.writeText(result.url!)
                    setCopied(true)
                  }}
                  className="shrink-0 rounded-xl border border-border px-3 py-2 text-sm hover:bg-surface-2"
                >
                  {copied ? 'Copied ✓' : 'Copy'}
                </button>
              </div>
            )}
            <div className="mt-1 flex gap-2">
              <button
                onClick={inviteAnother}
                className="flex-1 rounded-xl border border-border px-3 py-2 text-sm hover:bg-surface-2"
              >
                Invite another
              </button>
              <button
                onClick={props.onClose}
                className="flex-1 rounded-xl px-3 py-2 text-sm font-semibold text-white"
                style={{
                  backgroundImage:
                    'linear-gradient(135deg, var(--brand-a), var(--brand-b))',
                }}
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              Email address
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="person@company.com"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand-a"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              Display name{' '}
              <span className="text-xs font-normal text-muted">
                — how everyone will see them; only you can change it later
              </span>
              <input
                required
                maxLength={60}
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Ahmed K."
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand-a"
              />
            </label>

            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1 text-sm">
                Role
                <select
                  value={role}
                  onChange={(e) =>
                    setRole(e.target.value as 'member' | 'client' | 'admin')
                  }
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm"
                >
                  <option value="member">Team member</option>
                  <option value="client">Client</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <label className="flex flex-1 flex-col gap-1 text-sm">
                Job title
                <input
                  maxLength={60}
                  value={roleLabel}
                  onChange={(e) => setRoleLabel(e.target.value)}
                  placeholder="Developer"
                  className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand-a"
                />
              </label>
            </div>

            <p className="rounded-xl bg-surface-2/60 p-2.5 text-xs text-muted">
              {role === 'client'
                ? 'Clients see masked identities: display names and job titles only — never emails, phone numbers, or nicknames.'
                : 'Team members see each other normally. Real contact details stay admin-only either way.'}
            </p>

            {error && <p className="text-sm text-danger">{error}</p>}

            <button
              type="submit"
              disabled={busy || !email.trim() || !displayName.trim()}
              className="rounded-xl px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              style={{
                backgroundImage:
                  'linear-gradient(135deg, var(--brand-a), var(--brand-b))',
              }}
            >
              {busy ? 'Sending…' : 'Send invitation'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
