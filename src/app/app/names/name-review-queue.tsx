'use client'

import gsap from 'gsap'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Finding } from '@/lib/detection'
import { accentFor, gradientStyle, initials } from '@/lib/ui/colors'

/**
 * Name-change review (M4-07).
 *
 * The reviewer sees the requested string with detection findings
 * highlighted — the whole point of scanning before an admin looks. A name
 * like "Ahmed — wa.me/923001234567" would otherwise sail past a distracted
 * click into a field every client in the workspace reads.
 *
 * Same loader discipline as the moderation queue: a failed fetch says so
 * and retries, instead of leaving skeletons up forever.
 */

type RequestItem = {
  id: string
  userId: string
  currentName: string
  requestedName: string
  findings: Finding[]
  flagged: boolean
  createdAt: string
}

export function NameReviewQueue() {
  const [queue, setQueue] = useState<RequestItem[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const refetch = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/name-change-requests')
      if (!response.ok) {
        setLoadError(`Could not load requests (${response.status}) — retrying…`)
        return false
      }
      const data = (await response.json()) as { requests: RequestItem[] }
      setQueue(data.requests)
      setLoadError(null)
      return true
    } catch {
      setLoadError('Could not load requests — check your connection.')
      return false
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let attempts = 0
    const tick = async () => {
      if (cancelled) return
      const ok = await refetch()
      if (cancelled) return
      attempts += 1
      timer = setTimeout(tick, ok ? 60_000 : Math.min(1_000 * attempts, 8_000))
    }
    timer = setTimeout(tick, 0)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [refetch])

  useEffect(() => {
    if (!queue?.length || !listRef.current) return
    gsap.from(listRef.current.querySelectorAll('[data-card]'), {
      y: 10,
      opacity: 0,
      duration: 0.3,
      stagger: 0.05,
      ease: 'power2.out',
    })
  }, [queue])

  async function review(item: RequestItem, decision: 'approved' | 'rejected') {
    setBusy(item.id)
    const response = await fetch(`/api/name-change-requests/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    })
    if (response.ok || response.status === 404) {
      setQueue((current) => (current ?? []).filter((q) => q.id !== item.id))
      setToast(
        decision === 'approved'
          ? `Name updated to “${item.requestedName}”`
          : 'Request rejected — the name is unchanged',
      )
      setTimeout(() => setToast(null), 5000)
    } else {
      const data = (await response.json().catch(() => null)) as {
        error?: string
      } | null
      setToast(data?.error ?? 'action failed')
      setTimeout(() => setToast(null), 5000)
    }
    setBusy(null)
  }

  return (
    <main className="mx-auto flex h-full w-full max-w-3xl flex-col overflow-y-auto p-4 md:p-6">
      <header className="mb-5 flex items-center gap-3">
        <div>
          <h1 className="text-xl font-semibold">Name changes</h1>
          <p className="text-sm text-muted">
            Members ask; you decide. Requested names are screened first.
          </p>
        </div>
        {queue !== null && queue.length > 0 && (
          <span className="ml-auto rounded-full bg-hold/15 px-3 py-1 text-sm font-semibold text-hold">
            {queue.length} waiting
          </span>
        )}
      </header>

      {loadError && (
        <div className="mb-4 flex items-center gap-3 rounded-xl border border-danger bg-danger/10 p-3 text-sm">
          <span className="flex-1 font-medium text-danger">{loadError}</span>
          <button
            onClick={() => void refetch()}
            className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-surface-2"
          >
            Retry now
          </button>
        </div>
      )}

      <div ref={listRef} className="flex flex-col gap-4">
        {queue === null ? (
          <>
            <div className="skeleton h-32" />
            <div className="skeleton h-32" />
          </>
        ) : queue.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-10 text-center">
            <p className="mt-2 font-medium">No requests waiting</p>
            <p className="mt-1 text-sm text-muted">
              When someone asks to change their display name, it lands here.
            </p>
          </div>
        ) : (
          queue.map((item) => (
            <article
              key={item.id}
              data-card
              className={`rounded-2xl border bg-surface p-4 shadow-sm ${
                item.flagged ? 'border-hold' : 'border-border'
              }`}
            >
              <div className="mb-3 flex items-center gap-3">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                  style={gradientStyle(item.userId)}
                >
                  {initials(item.currentName || '?')}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span
                      className="font-semibold"
                      style={{ color: accentFor(item.userId) }}
                    >
                      {item.currentName}
                    </span>{' '}
                    <span className="text-muted">wants to be called</span>
                  </p>
                  {item.flagged && (
                    <p className="text-xs font-semibold text-hold">
                      ⚠ contains contact details
                    </p>
                  )}
                </div>
              </div>

              <p className="rounded-xl bg-surface-2/60 p-3 text-lg">
                <HighlightedName
                  name={item.requestedName}
                  findings={item.findings}
                />
              </p>

              {item.findings.length > 0 && (
                <p className="mt-2 text-xs text-muted">
                  {item.findings
                    .map((f) => `${f.type.replace('_', ' ')} (${f.rule_id})`)
                    .join(' · ')}
                </p>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => review(item, 'approved')}
                  disabled={busy === item.id}
                  className="flex-1 rounded-xl bg-brand-b/15 px-4 py-2 text-sm font-semibold text-brand-b transition-transform enabled:hover:scale-[1.02] disabled:opacity-50"
                >
                  ✓ Approve name
                </button>
                <button
                  onClick={() => review(item, 'rejected')}
                  disabled={busy === item.id}
                  className="flex-1 rounded-xl bg-danger/10 px-4 py-2 text-sm font-semibold text-danger transition-transform enabled:hover:scale-[1.02] disabled:opacity-50"
                >
                  ✕ Reject
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-xl border border-border bg-surface px-4 py-2.5 text-sm shadow-lg">
          {toast}
        </div>
      )}
    </main>
  )
}

/** Same defensive span handling as the moderation queue: bad spans degrade. */
function HighlightedName(props: { name: string; findings: Finding[] }) {
  const spans = (props.findings ?? [])
    .map((f) => f.span)
    .filter(
      (s): s is [number, number] =>
        Array.isArray(s) &&
        s.length === 2 &&
        Number.isFinite(s[0]) &&
        Number.isFinite(s[1]) &&
        s[0] >= 0 &&
        s[1] > s[0] &&
        s[1] <= props.name.length,
    )
    .sort((a, b) => a[0] - b[0])

  if (spans.length === 0) return <>{props.name}</>

  const parts: React.ReactNode[] = []
  let cursor = 0
  for (const [start, end] of spans) {
    if (start < cursor) continue
    if (start > cursor) parts.push(props.name.slice(cursor, start))
    parts.push(
      <mark key={start} className="rounded bg-hold/25 px-0.5 font-medium text-hold">
        {props.name.slice(start, end)}
      </mark>,
    )
    cursor = end
  }
  if (cursor < props.name.length) parts.push(props.name.slice(cursor))
  return <>{parts}</>
}
