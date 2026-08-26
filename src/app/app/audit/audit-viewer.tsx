'use client'

import gsap from 'gsap'
import { useCallback, useEffect, useRef, useState } from 'react'

import { openDownload } from '@/lib/desktop-shell'
import type { GroupRow } from '@/lib/types'
import { PersonMark } from '@/lib/ui/avatar'
import { prefersReducedMotion } from '@/lib/ui/dismiss'
import { DownloadIcon, LockIcon } from '@/lib/ui/icons'
import { PageHeader } from '@/lib/ui/page-header'
import { SelectMenu } from '@/lib/ui/select-menu'

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
  /** Server-fetched first page — paints instantly, no second skeleton. */
  initialEntries?: Entry[]
  initialNextBefore?: number | null
  initialCheck?: ChainCheck | null
}) {
  const [entries, setEntries] = useState<Entry[] | null>(
    props.initialEntries ?? null,
  )
  const [nextBefore, setNextBefore] = useState<number | null>(
    props.initialNextBefore ?? null,
  )
  // Keyset pagination: cursors[i] is the `before` value that produced page
  // i, so Previous is a pop rather than an offset (stable while the
  // append-only log keeps growing underneath).
  const [cursors, setCursors] = useState<Array<number | null>>([null])
  const [pageIndex, setPageIndex] = useState(0)
  const [pageSize, setPageSize] = useState(50)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  const [check, setCheck] = useState<ChainCheck | null>(
    props.initialCheck ?? null,
  )
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

  // Changing a filter or the page size starts a fresh first page. The
  // FIRST run is skipped when the server already provided that page —
  // re-fetching it would flash the skeleton over real rows.
  const skipInitialLoad = useRef(props.initialEntries !== undefined)
  useEffect(() => {
    if (skipInitialLoad.current) {
      skipInitialLoad.current = false
      return
    }
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
    if (props.initialCheck !== undefined) return // server already provided it
    queueMicrotask(() => {
      void fetch('/api/audit/verify')
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d && setCheck((d as { check: ChainCheck | null }).check))
    })
  }, [props.initialCheck])

  useEffect(() => {
    if (!entries?.length || !listRef.current || prefersReducedMotion()) return
    gsap.fromTo(
      listRef.current.querySelectorAll('[data-row]:nth-child(-n+15)'),
      { opacity: 0, y: 6 },
      { opacity: 1, y: 0, duration: 0.2, stagger: 0.02, ease: 'power1.out' },
    )
  }, [entries])

  useEffect(() => {
    if (!exportOpen) return
    function onDown(event: MouseEvent) {
      if (!exportRef.current?.contains(event.target as Node)) {
        setExportOpen(false)
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setExportOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [exportOpen])

  async function runVerify() {
    setVerifying(true)
    const response = await fetch('/api/audit/verify', { method: 'POST' })
    if (response.ok) {
      const data = (await response.json()) as { check: ChainCheck }
      setCheck(data.check)
    }
    setVerifying(false)
  }

  /**
   * Three exports, not one. The plain timeline proves a process ran; it
   * cannot show WHAT was caught, because every held row records only
   * `findings_count: 1`. The findings column is the fact a dispute turns on.
   * The full message text is everything around that fact — ordinary client
   * conversation — so it is a separate, deliberate choice, and the server
   * records an audit entry when either content column is taken.
   */
  function exportCsv(include?: 'findings' | 'body') {
    const params = new URLSearchParams()
    if (groupId) params.set('groupId', groupId)
    if (actorName) params.set('actorName', actorName)
    if (eventType) params.set('eventType', eventType)
    // Bodies without findings would be a wall of text with nothing pointing
    // at the reason any of it is in the file.
    if (include === 'findings') params.set('findings', '1')
    if (include === 'body') {
      params.set('findings', '1')
      params.set('body', '1')
    }
    setExportOpen(false)
    openDownload(`/api/audit/export?${params}`)
  }

  const timeFormat = new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  })

  return (
    <main className="mx-auto flex h-full w-full max-w-235 flex-col overflow-y-auto p-4 md:px-10 md:py-8">
      <PageHeader
        breadcrumb="Track"
        title="Audit log"
        description="Every action, forever — the evidence surface"
        actions={
          <div ref={exportRef} className="relative">
            <button
              onClick={() => setExportOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={exportOpen}
              className="btn btn-secondary"
            >
              <DownloadIcon /> Export CSV
            </button>
            {exportOpen && (
              <div
                role="menu"
                className="absolute right-0 top-11 z-40 w-72 overflow-hidden rounded-[10px] border border-border bg-surface text-left shadow-e2"
              >
                {[
                  {
                    label: 'Timeline only',
                    hint: 'Who did what, when. No message content.',
                    include: undefined,
                  },
                  {
                    label: 'Timeline + findings',
                    hint: 'Adds what was detected — "03001234567".',
                    include: 'findings' as const,
                  },
                  {
                    label: 'Timeline + full messages',
                    hint: 'Adds every message body. Recorded in the log.',
                    include: 'body' as const,
                  },
                ].map((choice) => (
                  <button
                    key={choice.label}
                    type="button"
                    role="menuitem"
                    onClick={() => exportCsv(choice.include)}
                    className="block w-full px-3 py-2.5 text-left hover:bg-hover"
                  >
                    <span className="block text-sm">{choice.label}</span>
                    <span className="block text-xs text-muted">
                      {choice.hint}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
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
        <SelectMenu
          value={groupId}
          onChange={setGroupId}
          ariaLabel="Filter by group"
          options={[
            { value: '', label: 'All groups' },
            ...props.groups.map((g) => ({
              value: g.id,
              label: g.name + (g.status !== 'active' ? ` (${g.status})` : ''),
            })),
          ]}
        />
        <input
          value={actorName}
          onChange={(e) => setActorName(e.target.value)}
          aria-label="Filter by member name"
          placeholder="Filter by member name…"
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-teal-d"
        />
        <SelectMenu
          value={eventType}
          onChange={setEventType}
          ariaLabel="Filter by event type"
          options={[
            { value: '', label: 'All events' },
            ...EVENT_TYPES.map((t) => ({ value: t, label: `${t}.*` })),
          ]}
        />
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
        <span className="flex items-center gap-2 text-muted">
          Rows
          <SelectMenu
            value={String(pageSize)}
            onChange={(v) => setPageSize(Number(v))}
            ariaLabel="Rows per page"
            compact
            direction="up"
            className="w-20 text-foreground"
            options={[
              { value: '25', label: '25' },
              { value: '50', label: '50' },
              { value: '100', label: '100' },
            ]}
          />
        </span>
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
