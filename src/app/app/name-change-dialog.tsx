'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'

import { useEscape } from '@/lib/ui/dismiss'

/**
 * Ask an admin to change your display name (M4-07's member side).
 *
 * I2 in the user's own words: you cannot set your name, you can only ask.
 * The requested string is scanned server-side BEFORE any admin sees it, so
 * this form is not an unscanned channel into a field every client reads —
 * but the requester is never told WHICH rule tripped, only that it will be
 * reviewed. Telling them would be a free lesson in evading the scanner.
 *
 * PORTALED to document.body: one call site sits inside the frosted top bar,
 * and a backdrop-filter ancestor becomes the containing block for
 * position:fixed — without the portal the "full-screen" scrim would resolve
 * against the 56px header and the card would vanish above the viewport.
 */
export function NameChangeDialog(props: {
  currentName: string
  onClose: () => void
}) {
  const [requested, setRequested] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  useEscape(props.onClose)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (busy || !requested.trim()) return
    setBusy(true)
    setError(null)

    let response: Response
    try {
      response = await fetch('/api/name-change-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestedName: requested.trim() }),
      })
    } catch {
      // Network down — never leave the button stuck on "Sending…".
      setError('could not reach the server — check your connection')
      setBusy(false)
      return
    }
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

  return createPortal(
    <div
      className="overlay-in fixed inset-0 z-400 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
      onClick={props.onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-change-title"
        className="card-in w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-e2"
      >
        <header className="mb-4 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="name-change-title" className="text-lg font-semibold">
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
          <button onClick={props.onClose} className="btn btn-primary w-full py-2.5">
            Done
          </button>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <div className="rounded-[10px] border border-border bg-surface-2 p-3 text-sm">
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
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-teal-d"
              />
            </label>

            <p className="rounded-[10px] bg-surface-2 p-2.5 text-xs text-muted">
              Names are screened like messages — a name carrying an email,
              phone number or link is flagged for the admin reviewing it.
            </p>

            {error && <p className="text-sm text-danger">{error}</p>}

            <button
              type="submit"
              disabled={busy || !requested.trim()}
              className="btn btn-primary py-2.5"
            >
              {busy ? 'Sending…' : 'Send request'}
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  )
}
