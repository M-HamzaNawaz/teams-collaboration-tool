'use client'

import gsap from 'gsap'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { GroupRow } from '@/lib/types'
import { accentFor, initials } from '@/lib/ui/colors'
import { ThemeToggle } from '@/lib/ui/theme-toggle'

/**
 * Audit viewer (M9-02): filters compose, payloads expand, CSV exports.
 * Acceptance: reconstruct one member's timeline in one group without SQL —
 * that is literally the actor + group filters together.
 */

type Entry = {
  id: number
  actor_id: string | null
  actor_display_name: string
  group_id: string | null
  group_name: string
  event_type: string
  payload_jsonb: Record<string, unknown>
  created_at: string
}

type ChainCheck = { ok: boolean; first_bad_id: number | null; checked_at: string }

const EVENT_TYPES = [
  'auth', 'workspace', 'group', 'member', 'invite', 'consent',
  'message', 'file', 'name_change',
]

export function AuditViewer(props: {
  groups: Pick<GroupRow, 'id' | 'name' | 'status'>[]
}) {
  const [entries, setEntries] = useState<Entry[] | null>(null)
  const [nextBefore, setNextBefore] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [check, setCheck] = useState<ChainCheck | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [verifying, setVerifying] = useState(false)
  const [groupId, setGroupId] = useState('')
  const [actorName, setActorName] = useState('')
  const [eventType, setEventType] = useState('')
  const listRef = useRef<HTMLDivElement>(null)

  const load = useCallback(
    async (before?: number | null) => {
      const params = new URLSearchParams()
      if (groupId) params.set('groupId', groupId)
      if (actorName) params.set('actorName', actorName)
      if (eventType) params.set('eventType', eventType)
      if (before) params.set('before', String(before))
      const response = await fetch(`/api/audit?${params}`)
      if (!response.ok) {
        // Never leave the skeletons up silently — the same trap the
        // moderation queue fell into.
        setLoadError(`Could not load the audit log (${response.status}).`)
        setEntries([])
        return
      }
      setLoadError(null)
      const data = (await response.json()) as {
        entries: Entry[]
        nextBefore: number | null
      }
      setEntries((current) =>
        before ? [...(current ?? []), ...data.entries] : data.entries,
      )
      setNextBefore(data.nextBefore)
    },
    [groupId, actorName, eventType],
  )

  useEffect(() => {
    // Deferred (React 19 lint: no sync setState in effects); doubles as the
    // typing debounce.
    const clear = setTimeout(() => setEntries(null), 0)
    const t = setTimeout(() => void load(), 250)
    return () => {
      clearTimeout(clear)
      clearTimeout(t)
    }
  }, [load])

  useEffect(() => {
    queueMicrotask(() => {
      void fetch('/api/audit/verify')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setCheck((d as { check: ChainCheck | null }).check))
    })
  }, [])

  useEffect(() => {
    if (!entries?.length || !listRef.current) return
    gsap.fromTo(
      listRef.current.querySelectorAll('[data-row]:nth-child(-n+15)'),
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.2, stagger: 0.02, ease: 'power1.out' },
    )
  }, [entries])

  async function runVerify() {
    setVerifying(true)
    const response = await fetch('/api/audit/verify', { method: 'POST' })
    if (response.ok) {
      const data = (await response.json()) as { check: ChainCheck }
      setCheck(data.check)
    }
    setVerifying(false)
  }

  function exportCsv() {
    const params = new URLSearchParams()
    if (groupId) params.set('groupId', groupId)
    if (actorName) params.set('actorName', actorName)
    if (eventType) params.set('eventType', eventType)
    window.open(`/api/audit/export?${params}`, '_blank', 'noopener')
  }

  const timeFormat = new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col p-4 md:p-6">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <a href="/app" className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2">
          ← Chat
        </a>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">Audit log</h1>
          <p className="text-sm text-muted">Every action, forever — the evidence surface</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={exportCsv}
            className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-surface-2"
          >
            ⬇ Export CSV
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* Chain status (M9-03) */}
      <div
        className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm ${
          check && !check.ok
            ? 'border-danger bg-danger/10'
            : 'border-border bg-surface'
        }`}
      >
        <span className="text-lg">{check ? (check.ok ? '🔒' : '🚨') : '⏳'}</span>
        <span className="min-w-0 flex-1">
          {check === null && 'Chain not yet verified.'}
          {check?.ok &&
            `Hash chain verified intact · ${timeFormat.format(new Date(check.checked_at))}`}
          {check && !check.ok && (
            <span className="font-semibold text-danger">
              CHAIN BROKEN at entry #{check.first_bad_id} — records after this
              point may have been altered.
            </span>
          )}
        </span>
        <button
          onClick={runVerify}
          disabled={verifying}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2 disabled:opacity-50"
        >
          {verifying ? 'Verifying…' : 'Verify now'}
        </button>
      </div>

      {/* Filters (compose) */}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
        >
          <option value="">All groups</option>
          {props.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
              {g.status !== 'active' ? ` (${g.status})` : ''}
            </option>
          ))}
        </select>
        <input
          value={actorName}
          onChange={(e) => setActorName(e.target.value)}
          placeholder="Filter by member name…"
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand-a"
        />
        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          className="rounded-xl border border-border bg-surface px-3 py-2 text-sm"
        >
          <option value="">All events</option>
          {EVENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}.*
            </option>
          ))}
        </select>
      </div>

      {loadError && (
        <div className="mb-3 flex items-center gap-3 rounded-xl border border-danger bg-danger/10 p-3 text-sm">
          <span className="flex-1 font-medium text-danger">{loadError}</span>
          <button
            onClick={() => void load()}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
          >
            Retry
          </button>
        </div>
      )}

      {/* Entries */}
      <div ref={listRef} className="flex flex-col gap-1">
        {entries === null ? (
          Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton h-12" />)
        ) : entries.length === 0 ? (
          <p className="rounded-xl border border-border bg-surface p-8 text-center text-sm text-muted">
            No entries match these filters.
          </p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} data-row>
              <button
                onClick={() =>
                  setExpanded(expanded === entry.id ? null : entry.id)
                }
                className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-2/60"
              >
                <span
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                  style={{
                    background: entry.actor_id
                      ? accentFor(entry.actor_id)
                      : 'var(--muted)',
                  }}
                >
                  {initials(entry.actor_display_name || 'Sys')}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    <span className="font-medium">
                      {entry.actor_display_name || 'system'}
                    </span>{' '}
                    <span className="font-mono text-xs text-brand-a">
                      {entry.event_type}
                    </span>
                    {entry.group_name && (
                      <span className="text-muted"> · {entry.group_name}</span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 text-xs text-muted">
                  {timeFormat.format(new Date(entry.created_at))}
                </span>
              </button>
              {expanded === entry.id && (
                <pre className="mx-3 mb-2 overflow-x-auto rounded-lg bg-surface-2/70 p-3 text-xs text-muted">
                  {JSON.stringify(entry.payload_jsonb, null, 2)}
                </pre>
              )}
            </div>
          ))
        )}
        {nextBefore && (
          <button
            onClick={() => void load(nextBefore)}
            className="mt-2 rounded-xl border border-border px-3 py-2 text-sm hover:bg-surface-2"
          >
            Load older entries
          </button>
        )}
      </div>
    </main>
  )
}
