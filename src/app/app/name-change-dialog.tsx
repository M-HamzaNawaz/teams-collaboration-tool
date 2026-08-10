'use client'

import { useState } from 'react'

/**
 * Ask an admin to change your display name (M4-07's member side).
 *
 * I2 in the user's own words: you cannot set your name, you can only ask.
 * The requested string is scanned server-side BEFORE any admin sees it, so
 * this form is not an unscanned channel into a field every client reads —
 * but the requester is never told WHICH rule tripped, only that it will be
 * reviewed. Telling them would be a free lesson in evading the scanner.
 */
export function NameChangeDialog(props: {
  currentName: string
  onClose: () => void
}) {
  const [requested, setRequested] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy || !requested.trim()) return
    setBusy(true)
    setError(null)

    const response = await fetch('/api/name-change-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestedName: requested.trim() }),
    })
    const data = (await response.json().catch(() => null)) as
      | { request?: { status: string }; error?: string }
      | null

    if (response.status === 201) {
      setSent(true)
    } else {
      setError(data?.error ?? 'could not send the request')
    }
    setBusy(false)
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
              {sent ? 'Request sent' : 'Request a name change'}
            </h2>
            <p className="text-sm text-muted">
              {sent
                ? 'An admin will review it shortly.'
                : 'Display names are set by your workspace admin — you can ask for a change.'}
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

        {sent ? (
          <button
            onClick={props.onClose}
            className="w-full rounded-xl px-3 py-2.5 text-sm font-semibold text-white"
            style={{
              backgroundImage:
                'linear-gradient(135deg, var(--brand-a), var(--brand-b))',
            }}
          >
            Done
          </button>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div className="rounded-xl border border-border bg-surface-2/50 p-3 text-sm">
              <p className="text-xs text-muted">Currently</p>
              <p className="font-medium">{props.currentName}</p>
            </div>

            <label className="flex flex-col gap-1 text-sm">
              New display name
              <input
                required
                autoFocus
                maxLength={60}
                value={requested}
                onChange={(e) => setRequested(e.target.value)}
                placeholder="Ahmed Khan"
                className="rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-brand-a"
              />
            </label>

            <p className="rounded-xl bg-surface-2/60 p-2.5 text-xs text-muted">
              Names are screened like messages — a name carrying an email,
              phone number or link is flagged for the admin reviewing it.
            </p>

            {error && <p className="text-sm text-danger">{error}</p>}

            <button
              type="submit"
              disabled={busy || !requested.trim()}
              className="rounded-xl px-3 py-2.5 text-sm font-semibold text-white disabled:opacity-40"
              style={{
                backgroundImage:
                  'linear-gradient(135deg, var(--brand-a), var(--brand-b))',
              }}
            >
              {busy ? 'Sending…' : 'Send request'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
