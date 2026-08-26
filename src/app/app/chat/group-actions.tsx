'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

import type { GroupRow } from '@/lib/types'
import { useEscape } from '@/lib/ui/dismiss'
import { HoldButton } from '@/lib/ui/hold-button'
import { ArchiveIcon, CheckIcon, LoaderIcon } from '@/lib/ui/icons'

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
  const [savingLevel, setSavingLevel] = useState(false)
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

  /**
   * Screening strictness, straight from the menu. Until now these lived only
   * in settings_jsonb at creation time, so "hold every number in this room"
   * meant hand-editing the database — the rule existed and the switch did
   * not. Percentages are measured against the corpus, and they are shown
   * because a third of held messages is a real cost someone should agree to
   * before choosing it, not discover afterwards.
   */
  const LEVELS: Array<{
    label: string
    hint: string
    value: number | null
  }> = [
    {
      label: 'Contact info only',
      hint: 'Phone numbers, emails, handles. Recommended.',
      value: null,
    },
    {
      label: 'Long numbers too',
      hint: '7+ digits — also holds invoice and order refs (~28%).',
      value: 7,
    },
    {
      label: 'Any number at all',
      hint: 'Every digit, including "3pm" and "v2.0.1" (~67%).',
      value: 1,
    },
  ]
  const levelFromServer =
    (props.group.settings_jsonb as { hold_numbers_min_digits?: number } | null)
      ?.hold_numbers_min_digits ?? null

  /**
   * The tick is driven by LOCAL state, not by props.
   *
   * It was read straight off props.group, which the chat page had already
   * rendered — so a save changed the database and the audit log while the
   * menu carried on showing the old level. The setting looked broken when it
   * had worked, which invites clicking it again; the audit trail ended up
   * with three identical entries proving exactly that.
   *
   * Re-synced only when the GROUP changes, so switching rooms reads the
   * server value while a just-made choice is never clobbered by a prop that
   * has not caught up yet.
   */
  const [level, setLevelState] = useState<number | null>(levelFromServer)
  const syncedFor = useRef(props.group.id)
  useEffect(() => {
    if (syncedFor.current !== props.group.id) {
      syncedFor.current = props.group.id
      setLevelState(levelFromServer)
    }
  }, [props.group.id, levelFromServer])

  async function setLevel(value: number | null) {
    const previous = level
    setLevelState(value) // move the tick now; the request is the slow part
    setSavingLevel(true)
    setError(null)
    const response = await fetch(`/api/groups/${props.group.id}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holdNumbersMinDigits: value }),
    })
    setSavingLevel(false)
    if (!response.ok) {
      setLevelState(previous) // put it back rather than lie about the state
      const data = (await response.json().catch(() => null)) as
        | { error?: string }
        | null
      setError(data?.error ?? 'could not save that')
      return
    }
    // Neither onChanged() nor router.refresh() belongs here. onChanged is
    // wired to setSelected(null) — right for archive and delete, where the
    // group stops being viewable, and wrong here: it shut the whole chat
    // pane on a settings tweak. router.refresh() remounted this component
    // and closed the menu with it. Nothing else on screen renders the level,
    // and the write path reads settings from the database per message rather
    // than from this prop, so the change is live either way.
    //
    // The menu stays open and the tick moves. That IS the confirmation, and
    // its absence was why a save that worked read as no response at all.
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

          {props.group.status === 'active' && (
            <div className="border-t border-border">
              <p className="px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted">
                Hold for review
              </p>
              {LEVELS.map((choice) => {
                const active = level === choice.value
                return (
                  <button
                    key={choice.label}
                    onClick={() => !active && setLevel(choice.value)}
                    disabled={savingLevel}
                    className={`flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-surface-2 disabled:opacity-50 ${
                      active ? 'bg-sel' : ''
                    }`}
                  >
                    <span className="mt-0.5 shrink-0 text-teal-t">
                      {active ? <CheckIcon /> : <span className="block w-4" />}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm">{choice.label}</span>
                      <span className="block text-xs text-muted">
                        {choice.hint}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
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
              {busy ? (
                <button disabled className="btn btn-primary flex-1">
                  <Spinner /> Archiving…
                </button>
              ) : (
                <HoldButton
                  onComplete={archive}
                  fillClassName="bg-teal-d"
                  holdingLabel="Keep holding…"
                  className="btn btn-primary flex-1"
                >
                  Hold to archive
                </HoldButton>
              )}
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
              {busy ? (
                <button disabled className="btn btn-danger flex-1">
                  <Spinner /> Deleting…
                </button>
              ) : (
                <HoldButton
                  onComplete={destroy}
                  disabled={typed !== props.group.name}
                  fillClassName="bg-black/25"
                  holdingLabel="Keep holding…"
                  className="btn btn-danger flex-1"
                >
                  Hold to delete
                </HoldButton>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
