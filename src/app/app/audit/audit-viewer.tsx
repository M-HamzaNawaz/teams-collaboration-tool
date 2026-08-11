'use client'

import gsap from 'gsap'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { GroupRow } from '@/lib/types'
import { PersonMark } from '@/lib/ui/avatar'
import { prefersReducedMotion } from '@/lib/ui/dismiss'
import { DownloadIcon, LockIcon } from '@/lib/ui/icons'
import { PageHeader } from '@/lib/ui/page-header'

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
  // Keyset pagination: cursors[i] is the `before` value that produced page
  // i, so Previous is a pop rather than an offset (stable while the
  // append-only log keeps growing underneath).
  const [cursors, setCursors] = useState<Array<number | null>>([null])
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(50)
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
      params.set('limit', String(pageSize))
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
      setEntries(data.entries)
      setNextBefore(data.nextBefore)
    },
    [groupId, actorName, eventType, pageSize],
  )

  // Changing a filter or the page size starts a fresh first page.
  useEffect(() => {
    const clear = setTimeout(() => {
      setEntries(null)
      setCursors([null])
      setPageIndex(0)
    }, 0)
    const t = setTimeout(() => void load(), 250) // doubles as typing debounce
    return () => {
      clearTimeout(clear)
      clearTimeout(t)
    }
  }, [load])

  function goNext() {
    if (nextBefore === null) return
    setCursors((c) => [...c.slice(0, pageIndex + 1), nextBefore])
    setPageIndex((i) => i + 1)
    setEntries(null)
    void load(nextBefore)
  }

  function goPrevious() {
    if (pageIndex === 0) return
    const target = cursors[pageIndex - 1]
    setPageIndex((i) => i - 1)
    setEntries(null)
    void load(target)
  }

  useEffect(() => {
    queueMicrotask(() => {
      void fetch('/api/audit/verify')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setCheck((d as { check: ChainCheck | null }).check))
    })
  }, [])

  useEffect(() => {
    if (!entries?.length || !listRef.current || prefersReducedMotion()) return
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
    <main className="mx-auto flex h-full w-full max-w-[940px] flex-col overflow-y-auto p-4 md:px-10 md:py-8">
      <PageHeader
        breadcrumb="Track"
        title="Audit log"
        description="Every action, forever — the evidence surface"
        actions={
          <button onClick={exportCsv} className="btn btn-secondary">
            <DownloadIcon /> Export CSV
          </button>
        }
      />

      {/* Chain status (M9-03) */}
      <div
        className={`mb-4 flex flex-wrap items-center gap-3 rounded-xl border p-3 text-sm shadow-e1 ${
          check && !check.ok
            ? 'border-danger bg-danger/10'
            : 'border-border bg-surface'
        }`}
      >
        <span
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            check && !check.ok ? 'bg-danger/15 text-danger' : 'bg-sel text-teal-t'
          }`}
        >
          <LockIcon />
        </span>
        <span className="min-w-0 flex-1">
          {check === null && 'Chain not yet verified.'}
          {check?.ok && (
            <>
              Hash chain verified intact ·{' '}
              <span className="font-mono text-xs tabular-nums">
                {timeFormat.format(new Date(check.checked_at))}
              </span>
            </>
          )}
          {check && !check.ok && (
            <span className="font-semibold text-danger">
              CHAIN BROKEN at entry{' '}
              <span className="font-mono">#{check.first_bad_id}</span> — records
              after this point may have been altered.
            </span>
          )}
        </span>
        <button
          onClick={runVerify}
          disabled={verifying}
          className="btn btn-secondary px-3 py-1.5 text-xs"
        >
          {verifying ? 'Verifying…' : 'Verify now'}
        </button>
      </div>

      {/* Filters (compose) — 1 / 1.4 / 1 */}
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.4fr_1fr]">
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          aria-label="Filter by group"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
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
          aria-label="Filter by member name"
          placeholder="Filter by member name…"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-teal-d"
        />
        <select
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          aria-label="Filter by event type"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
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
        <div className="mb-3 flex items-center gap-3 rounded-[10px] border border-danger bg-danger/10 p-3 text-sm">
          <span className="flex-1 font-medium text-danger">{loadError}</span>
          <button
            onClick={() => void load()}
            className="btn btn-secondary px-3 py-1.5 text-xs"
          >
            Retry
          </button>
        </div>
      )}

      {/* Entries */}
      <div
        ref={listRef}
        className="flex flex-col rounded-xl border border-border bg-surface p-1.5 shadow-e1"
      >
        {entries === null ? (
          Array.from({ length: 8 }, (_, i) => (
            <div key={i} className="skeleton mb-1 h-12" />
          ))
        ) : entries.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted">
            No entries match these filters.
          </p>
        ) : (
          entries.map((entry) => (
            <div key={entry.id} data-row>
              <button
                onClick={() =>
                  setExpanded(expanded === entry.id ? null : entry.id)
                }
                className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-left hover:bg-rowhover"
              >
                {entry.actor_id ? (
                  <PersonMark name={entry.actor_display_name || 'M'} size={28} />
                ) : (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-2 text-[10px] font-semibold text-muted">
                    SY
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">
                    <span className="font-semibold">
                      {entry.actor_display_name || 'system'}
                    </span>{' '}
                    <span className="rounded bg-sel px-1 font-mono text-xs text-teal-t">
                      {entry.event_type}
                    </span>
                    {entry.group_name && (
                      <span className="text-muted"> · {entry.group_name}</span>
                    )}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-xs tabular-nums text-muted">
                  {timeFormat.format(new Date(entry.created_at))}
                </span>
              </button>
              {expanded === entry.id && (
                <pre className="mx-3 mb-2 overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-xs text-ink-2">
                  {JSON.stringify(entry.payload_jsonb, null, 2)}
                </pre>
              )}
            </div>
          ))
        )}
      </div>

      {/* Pager */}
      <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border pt-3 text-sm">
        <label className="flex items-center gap-2 text-muted">
          Rows
          <select
            value={pageSize}
            onChange={(e) => setPageSize(Number(e.target.value))}
            className="rounded-lg border border-border bg-surface px-2 py-1 font-mono text-sm tabular-nums text-foreground"
          >
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
          </select>
        </label>
        <span className="font-mono text-xs tabular-nums text-muted">
          Page {pageIndex + 1}
          {entries?.length ? ` · ${entries.length} entries` : ''}
        </span>
        <div className="ml-auto flex gap-2">
          <button
            onClick={goPrevious}
            disabled={pageIndex === 0}
            className="btn btn-secondary px-3 py-1.5"
          >
            ← Newer
          </button>
          <button
            onClick={goNext}
            disabled={nextBefore === null}
            className="btn btn-secondary px-3 py-1.5"
          >
            Older →
          </button>
        </div>
      </div>
    </main>
  )
}
