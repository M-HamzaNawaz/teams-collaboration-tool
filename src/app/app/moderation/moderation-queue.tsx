'use client'

import gsap from 'gsap'
import { useCallback, useEffect, useRef, useState } from 'react'

import type { Finding } from '@/lib/detection'
import { browserClient } from '@/lib/supabase/browser-client'
import { PersonMark } from '@/lib/ui/avatar'
import { prefersReducedMotion } from '@/lib/ui/dismiss'
import { AlertTriangleIcon, CheckIcon, XIcon } from '@/lib/ui/icons'
import { PageHeader } from '@/lib/ui/page-header'

/**
 * The hold queue (M6-01/02/03).
 *
 * Each card shows the message AS TYPED with the findings' spans highlighted
 * (offsets map to the original text, M2-02), who sent it, where, and how
 * long it has waited. Approve delivers it — literally, via the RLS-filtered
 * status UPDATE (M5-02). Block turns the sender's bubble into the policy
 * notice. New holds and escalations arrive as broadcast events → toast +
 * refetch, no reload.
 */

type QueueItem = {
  id: string
  groupId: string
  groupName: string
  senderId: string
  senderName: string
  body: string
  createdAt: string
  waitingSeconds: number
  findings: Finding[]
  escalated: boolean
}

export function ModerationQueue(props: {
  workspaceId: string
  me: { userId: string; displayName: string; isAdmin: boolean }
}) {
  const [queue, setQueue] = useState<QueueItem[] | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Load the queue. Returns whether it succeeded, so the caller can retry
   * fast until the first good load.
   *
   * The failure path matters: this route is the admin's only view of held
   * messages, and silently leaving the skeletons up (the original bug —
   * caught by CI, where the first fetch lost a race with route compilation)
   * means an admin stares at shimmer forever with nothing to act on.
   */
  const refetch = useCallback(async (): Promise<boolean> => {
    try {
      const response = await fetch('/api/moderation/queue')
      if (!response.ok) {
        setLoadError(`Queue unavailable (${response.status}) — retrying…`)
        return false
      }
      const data = (await response.json()) as { queue: QueueItem[] }
      setQueue(data.queue)
      setLoadError(null)
      return true
    } catch {
      setLoadError('Queue unavailable — check your connection.')
      return false
    }
  }, [])

  const showToast = useCallback((text: string) => {
    setToast(text)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }, [])

  // Broadcast subscription (M6-03) + initial load. Broadcast needs no RLS
  // auth, but set the session anyway so reconnects stay consistent.
  useEffect(() => {
    const supabase = browserClient()
    const channel = supabase
      .channel(`workspace:${props.workspaceId}:moderation`)
      .on('broadcast', { event: 'message_held' }, () => {
        showToast('A new message was held for review')
        void refetch()
      })
      .on('broadcast', { event: 'message_escalated' }, () => {
        showToast('A held message escalated — it has waited too long')
        void refetch()
      })
      .subscribe()

    // Retry fast until the first successful load, then settle into a steady
    // poll. A single failed first fetch must never leave the admin with a
    // permanently empty-looking queue.
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>
    let attempts = 0
    const tick = async () => {
      if (cancelled) return
      const ok = await refetch()
      if (cancelled) return
      attempts += 1
      timer = setTimeout(tick, ok ? 30_000 : Math.min(1_000 * attempts, 8_000))
    }
    // Deferred — React 19 lint: no sync setState paths in effect bodies.
    timer = setTimeout(tick, 0)

    return () => {
      cancelled = true
      clearTimeout(timer)
      void supabase.removeChannel(channel)
    }
  }, [props.workspaceId, refetch, showToast])

  async function resolve(item: QueueItem, decision: 'approved' | 'blocked') {
    setBusy(item.id)
    const card = listRef.current?.querySelector(`[data-qid="${item.id}"]`)
    const response = await fetch(`/api/moderation/${item.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision }),
    })
    if (response.ok || response.status === 409) {
      if (card && !prefersReducedMotion()) {
        // Fade + lift out (JobPulse §5 dismiss), then the counts re-run.
        await gsap
          .to(card, {
            y: -14,
            opacity: 0,
            duration: 0.26,
            ease: 'power2.in',
          })
          .then()
      }
      setQueue((current) => (current ?? []).filter((q) => q.id !== item.id))
      showToast(
        decision === 'approved'
          ? 'Approved — delivered to the group'
          : 'Blocked — the sender sees the policy notice',
      )
    } else {
      const data = (await response.json().catch(() => null)) as {
        error?: string
      } | null
      showToast(data?.error ?? 'action failed')
    }
    setBusy(null)
  }

  return (
    <main className="mx-auto flex h-full w-full max-w-[760px] flex-col overflow-y-auto p-4 md:px-10 md:py-8">
      <PageHeader
        breadcrumb="Track"
        title="Moderation queue"
        description={
          props.me.isAdmin
            ? 'Every held message in the workspace'
            : 'Held messages in groups you manage'
        }
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
            <div className="skeleton h-36" />
            <div className="skeleton h-36" />
            <div className="skeleton h-36" />
          </>
        ) : queue.length === 0 ? (
          <div className="rounded-xl border border-border bg-surface p-10 text-center shadow-e1">
            <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-sel text-teal-t">
              <CheckIcon />
            </span>
            <p className="mt-3 font-medium">Queue is clear</p>
            <p className="mt-1 text-sm text-muted">
              Held messages appear here the moment they&apos;re caught.
            </p>
          </div>
        ) : (
          queue.map((item) => (
            <article
              key={item.id}
              data-qid={item.id}
              className={`rounded-xl border bg-surface p-4 shadow-e1 ${
                item.escalated ? 'border-teal-d' : 'border-border'
              }`}
            >
              <div className="mb-3 flex items-start gap-3">
                <PersonMark name={item.senderName} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    <span className="font-semibold">{item.senderName}</span>{' '}
                    <span className="text-muted">in</span>{' '}
                    <span className="font-semibold">{item.groupName}</span>
                  </p>
                  <p className="flex items-center gap-2 text-xs text-muted">
                    <span className="font-mono tabular-nums">
                      waiting {formatWait(item.waitingSeconds)}
                    </span>
                    {item.escalated && (
                      <span className="flex items-center gap-1 font-semibold text-teal-t">
                        <AlertTriangleIcon /> escalated
                      </span>
                    )}
                  </p>
                </div>
                {/* Rule chips — which detectors tripped */}
                <span className="flex max-w-[40%] flex-wrap justify-end gap-1">
                  {[...new Set(item.findings.map((f) => f.rule_id))]
                    .slice(0, 3)
                    .map((rule) => (
                      <span
                        key={rule}
                        className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-ink-2"
                      >
                        {rule}
                      </span>
                    ))}
                </span>
              </div>

              <blockquote className="rounded-[10px] bg-surface-2 p-3 text-sm leading-relaxed">
                <HighlightedBody body={item.body} findings={item.findings} />
              </blockquote>

              {item.findings.length > 0 && (
                <p className="mt-2 text-xs text-muted">
                  {item.findings
                    .map((f) => `${f.type.replace('_', ' ')} (${f.rule_id})`)
                    .join(' · ')}
                </p>
              )}

              <div className="mt-4 flex gap-2">
                <button
                  onClick={() => resolve(item, 'approved')}
                  disabled={busy === item.id}
                  className="btn btn-approve flex-1"
                >
                  <CheckIcon /> Approve & deliver
                </button>
                <button
                  onClick={() => resolve(item, 'blocked')}
                  disabled={busy === item.id}
                  className="btn btn-secondary flex-1"
                >
                  <XIcon /> Block
                </button>
              </div>
            </article>
          ))
        )}
      </div>

      {/* Toast (M6-03) */}
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

/**
 * The original text with findings' spans wrapped in amber marks (M2-02).
 *
 * Defensive on purpose: this page is the admin's ONLY window onto held
 * messages, so a malformed finding must degrade to unhighlighted text, never
 * crash the page. (Learned in CI: the seed's flag rows lacked `span`, and
 * destructuring undefined took the whole moderation queue down with
 * "TypeError: not iterable" — an admin blinded by one bad row.)
 */
function HighlightedBody(props: { body: string; findings: Finding[] }) {
  const spans = props.findings
    .map((f) => f.span)
    .filter(
      (s): s is [number, number] =>
        Array.isArray(s) &&
        s.length === 2 &&
        Number.isFinite(s[0]) &&
        Number.isFinite(s[1]) &&
        s[0] >= 0 &&
        s[1] > s[0] &&
        s[1] <= props.body.length,
    )
    .sort((a, b) => a[0] - b[0])

  if (spans.length === 0) return <>{props.body}</>

  const parts: React.ReactNode[] = []
  let cursor = 0
  for (const [start, end] of spans) {
    if (start < cursor) continue // overlapping finding — already covered
    if (start > cursor) parts.push(props.body.slice(cursor, start))
    parts.push(
      // The caught span reads as a teal-tint MONO chip (JobPulse §4.2/4.3).
      <mark
        key={start}
        className="rounded bg-sel px-1 font-mono text-[0.92em] font-medium text-teal-t"
      >
        {props.body.slice(start, end)}
      </mark>,
    )
    cursor = end
  }
  if (cursor < props.body.length) parts.push(props.body.slice(cursor))
  return <>{parts}</>
}

function formatWait(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`
}
