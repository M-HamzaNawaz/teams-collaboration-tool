'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import type { GroupRow } from '@/lib/types'
import { useEscape } from '@/lib/ui/dismiss'

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
    setOpen(false)
    setConfirming(false)
  })

  async function archive() {
    setBusy(true)
    setError(null)
    const response = await fetch(`/api/groups/${props.group.id}/archive`, {
      method: 'POST',
    })
    if (response.ok) {
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
              onClick={archive}
              disabled={busy}
              className="w-full px-3 py-2.5 text-left text-sm hover:bg-surface-2 disabled:opacity-50"
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

      {confirming && (
        <div
          className="overlay-in fixed inset-0 z-[400] flex items-center justify-center bg-black/30 p-4 backdrop-blur-[2px]"
          onClick={() => setConfirming(false)}
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
                className="btn btn-secondary flex-1"
              >
                Cancel
              </button>
              <button
                onClick={destroy}
                disabled={busy || typed !== props.group.name}
                className="btn btn-danger flex-1"
              >
                {busy ? 'Deleting…' : 'Delete permanently'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
