'use client'

import gsap from 'gsap'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Finding } from '@/lib/detection'
import { PersonMark } from '@/lib/ui/avatar'
import { prefersReducedMotion } from '@/lib/ui/dismiss'
import { AlertTriangleIcon, CheckIcon, XIcon } from '@/lib/ui/icons'
import { PageHeader } from '@/lib/ui/page-header'

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
  const router = useRouter()
  const [queue, setQueue] = useState<RequestItem[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  // Cards already animated in — the 60s poll must not replay the entrance.
  const animatedIds = useRef<Set<string>>(new Set())

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
    const fresh = Array.from(
      listRef.current.querySelectorAll<HTMLElement>('[data-card]'),
    ).filter((el) => !animatedIds.current.has(el.dataset.card ?? ''))
    for (const el of fresh) animatedIds.current.add(el.dataset.card ?? '')
    if (fresh.length === 0 || prefersReducedMotion()) return
    gsap.fromTo(
      fresh,
      { y: 10, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.3, stagger: 0.05, ease: 'power2.out' },
    )
  }, [queue])

  async function review(item: RequestItem, decision: 'approved' | 'rejected') {
    setBusy(item.id)
    const card = listRef.current?.querySelector(`[data-card="${item.id}"]`)
    const response = await fetch(`/api/name-change-requests/${item.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    })
    if (response.ok || response.status === 404) {
      if (card && !prefersReducedMotion()) {
        // Fade + lift out (JobPulse §5 dismiss).
        await gsap
          .to(card, { y: -14, opacity: 0, duration: 0.26, ease: 'power2.in' })
          .then()
      }
      setQueue((current) => (current ?? []).filter((q) => q.id !== item.id))
      setToast(
        decision === 'approved'
          ? `Name updated to “${item.requestedName}”`
          : 'Request rejected — the name is unchanged',
      )
      // Recompute the layout's alert dots (see moderation queue).
      router.refresh()
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
    <main className="mx-auto flex h-full w-full max-w-[760px] flex-col overflow-y-auto p-4 md:px-10 md:py-8">
      <PageHeader
        breadcrumb="Track"
        title="Name changes"
        description="Members ask; you decide. Requested names are screened first."
        actions={
          queue !== null && queue.length > 0 ? (
            <span className="pill-wait rounded-full bg-sel px-3 py-1 font-mono text-sm font-semibold tabular-nums text-teal-t">
              {queue.length} waiting
            </span>
          ) : undefined
        }
      />

      {loadError && (
        <div className="mb-4 flex items-center gap-3 rounded-[10px] border border-danger bg-danger/10 p-3 text-sm">
          <span className="flex-1 font-medium text-danger">{loadError}</span>
          <button
            onClick={() => void refetch()}
            className="btn btn-secondary px-3 py-1.5 text-xs"
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
          <div className="rounded-xl border border-border bg-surface p-10 text-center shadow-e1">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-sel text-teal-t">
              <CheckIcon />
            </span>
            <p className="mt-3 font-medium">All settled</p>
            <p className="mt-1 text-sm text-muted">
              When someone asks to change their display name, it lands here.
            </p>
          </div>
        ) : (
          queue.map((item) => (
            <article
              key={item.id}
              data-card={item.id}
              className={`rounded-xl border bg-surface p-4 shadow-e1 ${
                item.flagged ? 'border-teal-d' : 'border-border'
              }`}
            >
              <div className="mb-3 flex items-center gap-3">
                <PersonMark name={item.currentName || '?'} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-semibold">{item.currentName}</span>{' '}
                    <span className="text-muted">wants to be called</span>
                  </p>
                  {item.flagged && (
                    <p className="flex items-center gap-1 text-xs font-semibold text-teal-t">
                      <AlertTriangleIcon /> contains contact details
                    </p>
                  )}
                </div>
              </div>

              <p className="rounded-[10px] bg-surface-2 p-3 text-lg font-semibold">
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
                  className="btn btn-approve flex-1"
                >
                  <CheckIcon /> Approve name
                </button>
                <button
                  onClick={() => review(item, 'rejected')}
                  disabled={busy === item.id}
                  className="btn btn-secondary flex-1"
                >
                  <XIcon /> Reject
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-[500] -translate-x-1/2 rounded-[10px] border border-border bg-surface px-4 py-2.5 text-sm shadow-e2"
        >
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
      <mark
        key={start}
        className="rounded bg-sel px-1 font-mono text-[0.92em] font-medium text-teal-t"
      >
        {props.name.slice(start, end)}
      </mark>,
    )
    cursor = end
  }
  if (cursor < props.name.length) parts.push(props.name.slice(cursor))
  return <>{parts}</>
}
