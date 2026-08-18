'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { createPortal } from 'react-dom'

import { useEscape } from '@/lib/ui/dismiss'

/**
 * Edit profile — the ADMIN's direct path (members get the request dialog).
 *
 * The admin is the identity authority (I2), so making them "request" a name
 * change meant asking themselves for permission. This writes directly via
 * PATCH /api/workspace/profile, which still refuses names or job titles
 * containing contact details — that surface is broadcast to every client,
 * and nobody reviews the admin.
 *
 * Portaled to document.body: one call site sits inside the frosted top bar,
 * whose backdrop-filter would trap a fixed-position overlay.
 */
export function EditProfileDialog(props: {
  currentName: string
  currentRoleLabel: string
  onClose: () => void
}) {
  const router = useRouter()
  const [name, setName] = useState(props.currentName)
  const [roleLabel, setRoleLabel] = useState(props.currentRoleLabel)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEscape(props.onClose)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy || !name.trim()) return
    setBusy(true)
    setError(null)

    let response: Response
    try {
      response = await fetch('/api/workspace/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: name.trim(),
          roleLabel: roleLabel.trim(),
        }),
      })
    } catch {
      // Network down — never leave the button stuck on "Saving…".
      setError('could not reach the server — check your connection')
      setBusy(false)
      return
    }

    if (response.ok) {
      props.onClose()
      router.refresh() // the shell re-renders with the new identity
      return
    }
    const data = (await response.json().catch(() => null)) as
      | { error?: string }
      | null
    setError(data?.error ?? 'could not update the profile')
    setBusy(false)
  }

  return createPortal(
    <div
      className="overlay-in fixed inset-0 z-400 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
      onClick={props.onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-profile-title"
        className="card-in w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-e2"
      >
        <header className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="edit-profile-title" className="text-lg font-semibold">
              Edit profile
            </h2>
            <p className="text-sm text-muted">
              You&apos;re the workspace admin — your changes apply immediately
              and are recorded in the audit log.
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

        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Display name
            <input
              required
              autoFocus
              maxLength={60}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-teal-d"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Job title{' '}
            <span className="text-xs font-normal text-muted">
              — shown under your name across the workspace
            </span>
            <input
              maxLength={60}
              value={roleLabel}
              onChange={(e) => setRoleLabel(e.target.value)}
              placeholder="Founder"
              className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-teal-d"
            />
          </label>

          <p className="rounded-[10px] bg-surface-2 p-2.5 text-xs text-muted">
            Names and job titles are visible to every client, so they&apos;re
            screened the same way messages are — contact details are refused.
          </p>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={busy || !name.trim()}
            className="btn btn-primary py-2.5"
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>
    </div>,
    document.body,
  )
}
