'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import type { GroupRow } from '@/lib/types'
import { useEscape } from '@/lib/ui/dismiss'
import { ArchiveIcon, LoaderIcon } from '@/lib/ui/icons'

/** Turning arc shown inside a busy confirm button. */
function Spinner() {
  return (
    <span className="inline-flex animate-spin" aria-hidden="true">
      <LoaderIcon />
    </span>
  )
}

/**
 * Admin lifecycle controls for a group (M4-02's UI).
 *
 * active → archived → deleted, and never a shortcut: the API refuses a
 * delete unless the group is already archived, and refuses it again unless
 * the typed name matches. This menu simply exposes that two-step honestly —
 * archiving is presented as reversible-looking but permanent-deletion is
 * spelled out, because it purges messages and files for good.
 */
export function GroupActions(props: {
  group: GroupRow
  onChanged: () => void
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [confirmingArchive, setConfirmingArchive] = useState(false)
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onDown(event: MouseEvent) {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  useEscape(() => {
    // Never close mid-request — the user must see the action finish.
    if (busy) return
    setOpen(false)
    setConfirming(false)
    setConfirmingArchive(false)
  })

  async function archive() {
    setBusy(true)
    setError(null)
    const response = await fetch(`/api/groups/${props.group.id}/archive`, {
      method: 'POST',
    })
    if (response.ok) {
      setConfirmingArchive(false)
      setOpen(false)
      props.onChanged()
      router.refresh()
    } else {
      const data = (await response.json().catch(() => null)) as { error?: string } | null
      setError(data?.error ?? 'could not archive')
    }
    setBusy(false)
  }

  async function destroy() {
    setBusy(true)
    setError(null)
    const response = await fetch(`/api/groups/${props.group.id}/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmName: typed }),
    })
    if (response.ok) {
      setConfirming(false)
      setOpen(false)
      props.onChanged()
      router.refresh()
    } else {
      const data = (await response.json().catch(() => null)) as { error?: string } | null
      setError(data?.error ?? 'could not delete')
    }
    setBusy(false)
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Group settings"
        className="rounded-lg border border-border-2 px-2.5 py-1.5 text-sm hover:bg-hover"
      >
        ⋯
      </button>

      {open && (
        <div className="absolute right-0 top-10 z-40 w-64 overflow-hidden rounded-[10px] border border-border bg-surface shadow-e2">
          <p className="border-b border-border px-3 py-2 text-xs text-muted">
            {props.group.status === 'active'
              ? 'This group is active.'
              : 'This group is archived — read-only for everyone.'}
          </p>

          {props.group.status === 'active' && (
            <button
              onClick={() => {
                setOpen(false)
                setError(null)
                setConfirmingArchive(true)
              }}
              className="w-full px-3 py-2.5 text-left text-sm hover:bg-surface-2"
            >
              <span className="block font-medium">Archive group</span>
              <span className="block text-xs text-muted">
                Members lose access; you keep the full history.
              </span>
            </button>
          )}

          {props.group.status === 'archived' && (
            <button
              onClick={() => setConfirming(true)}
              className="w-full px-3 py-2.5 text-left text-sm text-danger hover:bg-danger/10"
            >
              <span className="block font-medium">Delete permanently</span>
              <span className="block text-xs text-muted">
                Purges messages and files. The audit trail survives.
              </span>
            </button>
          )}

          {error && <p className="px-3 pb-2 text-xs text-danger">{error}</p>}
        </div>
      )}

      {confirmingArchive && (
        <div
          className="overlay-in fixed inset-0 z-400 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
          onClick={() => !busy && setConfirmingArchive(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="archive-group-title"
            className="card-in w-full max-w-md rounded-xl border border-border bg-surface p-5 shadow-e2"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sel text-teal-t">
                <ArchiveIcon />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="archive-group-title" className="text-lg font-semibold">
                  Archive “{props.group.name}”?
                </h2>
                <p className="mt-1 text-sm text-muted">
                  The group becomes read-only. Members and clients lose access,
                  but you keep the full history — and you can delete it
                  permanently later if needed.
                </p>
              </div>
            </div>
            {error && <p className="mt-3 text-sm text-danger">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirmingArchive(false)}
                disabled={busy}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={archive}
                disabled={busy}
                className="btn btn-primary flex-1"
              >
                {busy ? (
                  <>
                    <Spinner /> Archiving…
                  </>
                ) : (
                  'Yes, archive it'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirming && (
        <div
          className="overlay-in fixed inset-0 z-400 flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
          onClick={() => !busy && setConfirming(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-group-title"
            className="card-in w-full max-w-md rounded-xl border border-danger bg-surface p-5 shadow-e2"
          >
            <h2 id="delete-group-title" className="text-lg font-semibold text-danger">
              Delete “{props.group.name}” permanently?
            </h2>
            <p className="mt-2 text-sm text-muted">
              Every message and file in this group is purged and cannot be
              recovered. The audit trail keeps a permanent record of what was
              deleted, by whom, and when.
            </p>
            <label className="mt-4 block text-sm">
              Type the group name to confirm
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={props.group.name}
                className="mt-1 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-danger"
              />
            </label>
            {error && <p className="mt-2 text-sm text-danger">{error}</p>}
            <div className="mt-4 flex gap-2">
              <button
                onClick={() => setConfirming(false)}
                disabled={busy}
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={destroy}
                disabled={busy || typed !== props.group.name}
                className="btn btn-danger flex-1"
              >
                {busy ? (
                  <>
                    <Spinner /> Deleting…
                  </>
                ) : (
                  'Delete permanently'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
