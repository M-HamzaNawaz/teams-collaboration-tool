'use client'

import gsap from 'gsap'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import {
  subscribeToGroupMessages,
  type RealtimeMessage,
} from '@/lib/realtime/messages'
import { browserClient } from '@/lib/supabase/browser-client'
import type { GroupRow } from '@/lib/types'
import { accentFor, gradientStyle, initials } from '@/lib/ui/colors'

import type { Me } from './chat-shell'

/**
 * Chat pane (M5-03/04): header, live message list, composer.
 *
 * List mechanics (M5-04):
 *  - newest page first, REVERSE-infinite: nearing the top fetches the next
 *    older page and restores the scroll offset so the viewport never jumps;
 *  - day separators and sender-run grouping;
 *  - autoscroll only when the reader is already at the bottom — loading
 *    history or reading back is never yanked away;
 *  - sorted by created_at, so an approved message lands back at its
 *    ORIGINAL position (spec §7; the "released" marker is M6-05).
 *
 * Reads are the caller's own RLS through the browser client; sends go
 * through POST /api/messages (M5-01) — a 'pending' verdict shows the amber
 * "pending review" state on the sender's bubble only. Subscribe-then-fetch,
 * because the realtime listener registers after SUBSCRIBED (M5-02).
 */

const FIRST_PAGE = 50
const OLDER_PAGE = 100

export function ChatPane(props: {
  group: GroupRow
  me: Me
  onBack: () => void
}) {
  const [messages, setMessages] = useState<RealtimeMessage[] | null>(null)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const scrollRef = useRef<HTMLDivElement>(null)
  const paneRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const lastIdRef = useRef<string | null>(null)
  // Element-based anchor: height math misses margin/separator re-rendering
  // at the prepend boundary (measured: a constant 12px nudge from mt-3).
  const prependRestore = useRef<{ anchorId: string; top: number } | null>(null)
  // Refs, not state: scroll events fire faster than React re-renders, so a
  // state-based in-flight guard reads stale and chains concurrent loads
  // (found by the M5-04 anchoring measurement — drift went from 26,000px to
  // 1px with this guard).
  const olderInFlight = useRef(false)
  const oldestRef = useRef<string | null>(null)
  const hasMoreRef = useRef(false)

  const upsert = useCallback((incoming: RealtimeMessage) => {
    setMessages((current) => {
      const list = current ?? []
      const index = list.findIndex((m) => m.id === incoming.id)
      const next =
        index === -1
          ? [...list, incoming]
          : list.map((m, i) => (i === index ? incoming : m))
      return next.sort((a, b) => a.created_at.localeCompare(b.created_at))
    })
  }, [])

  // ── Subscribe → fetch newest page + member names (that order, M5-02).
  useEffect(() => {
    const supabase = browserClient()
    const channel = subscribeToGroupMessages(supabase, props.group.id, upsert)

    async function load() {
      const [{ data: rows }, { data: profiles }] = await Promise.all([
        supabase
          .from('messages')
          .select('*')
          .eq('group_id', props.group.id)
          .order('created_at', { ascending: false })
          .limit(FIRST_PAGE),
        supabase
          .from('profiles')
          .select('user_id, display_name')
          .eq('workspace_id', props.group.workspace_id),
      ])
      const page = ((rows ?? []) as RealtimeMessage[]).reverse()
      setMessages(page)
      oldestRef.current = page[0]?.created_at ?? null
      hasMoreRef.current = page.length === FIRST_PAGE
      setHasMore(hasMoreRef.current)
      setNames(
        new Map(
          (profiles ?? []).map((p) => [
            p.user_id as string,
            p.display_name as string,
          ]),
        ),
      )
    }
    void load()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [props.group.id, props.group.workspace_id, upsert])

  // ── Reverse-infinite: nearing the top loads the next older page. All
  // guards and cursors are refs — one load in flight, ever.
  const loadOlder = useCallback(async () => {
    if (olderInFlight.current || !hasMoreRef.current || !oldestRef.current) {
      return
    }
    olderInFlight.current = true
    setLoadingOlder(true)

    const el = scrollRef.current
    const anchor = el?.querySelector('[data-mid]')
    if (el && anchor) {
      prependRestore.current = {
        anchorId: anchor.getAttribute('data-mid') ?? '',
        top: anchor.getBoundingClientRect().top,
      }
    }

    const supabase = browserClient()
    const { data: rows } = await supabase
      .from('messages')
      .select('*')
      .eq('group_id', props.group.id)
      .lt('created_at', oldestRef.current)
      .order('created_at', { ascending: false })
      .limit(OLDER_PAGE)

    const olderPage = ((rows ?? []) as RealtimeMessage[]).reverse()
    hasMoreRef.current = olderPage.length === OLDER_PAGE
    setHasMore(hasMoreRef.current)
    if (olderPage.length) {
      oldestRef.current = olderPage[0].created_at
      setMessages((current) => {
        const seen = new Set((current ?? []).map((m) => m.id))
        return [
          ...olderPage.filter((m) => !seen.has(m.id)),
          ...(current ?? []),
        ]
      })
    }
    setLoadingOlder(false)
    olderInFlight.current = false
  }, [props.group.id])

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    stickToBottom.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 60
    if (el.scrollTop < 120) void loadOlder()
  }

  // ── Scroll anchoring (M5-04 acceptance): a prepend must not move the
  // viewport; an append scrolls only if the reader was already at bottom.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !messages) return

    if (prependRestore.current) {
      const { anchorId, top } = prependRestore.current
      prependRestore.current = null
      const anchor = el.querySelector(`[data-mid="${anchorId}"]`)
      if (anchor) {
        // Put the anchor bubble back at the exact viewport offset it held
        // when the load started — immune to spacing changes around it.
        el.scrollTop += anchor.getBoundingClientRect().top - top
      }
      return
    }

    const lastId = messages[messages.length - 1]?.id ?? null
    if (lastId !== lastIdRef.current) {
      const isFirstRender = lastIdRef.current === null
      lastIdRef.current = lastId
      if (isFirstRender || stickToBottom.current) {
        el.scrollTop = el.scrollHeight
        if (!isFirstRender && paneRef.current) {
          const bubbles = paneRef.current.querySelectorAll(
            '[data-anim="bubble"]',
          )
          const last = bubbles[bubbles.length - 1]
          if (last) {
            gsap.fromTo(
              last,
              { y: 10, opacity: 0, scale: 0.98 },
              { y: 0, opacity: 1, scale: 1, duration: 0.25, ease: 'power2.out' },
            )
          }
        }
      }
    }
  }, [messages])

  async function send(event: React.FormEvent) {
    event.preventDefault()
    const body = draft.trim()
    if (!body || sending) return
    setSending(true)
    setNotice(null)

    const response = await fetch('/api/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ groupId: props.group.id, body }),
    })

    if (response.status === 201) {
      const { message } = (await response.json()) as {
        message: { id: string; status: string; createdAt: string }
      }
      setDraft('')
      stickToBottom.current = true
      // Own pending rows aren't guaranteed on the wire — upsert locally so
      // "pending review" is visible to the sender at once (never silently gone).
      upsert({
        id: message.id,
        workspace_id: props.group.workspace_id,
        group_id: props.group.id,
        sender_id: props.me.userId,
        body,
        status: message.status as RealtimeMessage['status'],
        created_at: message.createdAt,
        delivered_at: null,
      })
      if (message.status === 'pending') {
        setNotice('Your message is pending review by an admin before delivery.')
      }
    } else {
      const data = (await response.json().catch(() => null)) as {
        error?: string
      } | null
      setNotice(data?.error ?? 'send failed — try again')
    }
    setSending(false)
  }

  const timeFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }),
    [],
  )

  return (
    <div ref={paneRef} className="flex h-full min-w-0 flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border bg-surface p-3">
        <button
          onClick={props.onBack}
          className="rounded-lg p-2 hover:bg-surface-2 md:hidden"
          aria-label="Back to groups"
        >
          ←
        </button>
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white"
          style={gradientStyle(props.group.id)}
        >
          {initials(props.group.name)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{props.group.name}</h2>
          <p className="text-xs text-muted">
            Messages are screened for contact info
          </p>
        </div>
      </header>

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto p-4"
      >
        {messages === null ? (
          <MessageSkeletons />
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <p className="text-sm text-muted">
              No messages yet — say hello to the team.
            </p>
          </div>
        ) : (
          <>
            {loadingOlder && (
              <div className="flex justify-center pb-3">
                <div className="skeleton h-6 w-36" />
              </div>
            )}
            {!hasMore && messages.length > FIRST_PAGE && (
              <p className="pb-3 text-center text-xs text-muted">
                Beginning of the conversation
              </p>
            )}
            <ul className="flex flex-col gap-1.5">
              {messages.map((message, i) => {
                const own = message.sender_id === props.me.userId
                const prev = messages[i - 1]
                const separator = dayLabel(message.created_at, prev?.created_at)
                const firstOfRun =
                  !prev || prev.sender_id !== message.sender_id || !!separator
                return (
                  <li key={message.id}>
                    {separator && (
                      <div className="flex items-center gap-3 py-3">
                        <span className="h-px flex-1 bg-border" />
                        <span className="rounded-full bg-surface-2 px-3 py-1 text-[11px] font-medium text-muted">
                          {separator}
                        </span>
                        <span className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    <div
                      data-anim="bubble"
                      data-mid={message.id}
                      className={`flex ${own ? 'justify-end' : 'justify-start'}`}
                    >
                      <div
                        className={`max-w-[85%] md:max-w-[70%] ${
                          firstOfRun && !separator ? 'mt-3' : ''
                        }`}
                      >
                        {firstOfRun && !own && (
                          <p
                            className="mb-1 px-1 text-xs font-semibold"
                            style={{ color: accentFor(message.sender_id) }}
                          >
                            {names.get(message.sender_id) ?? 'Member'}
                          </p>
                        )}
                        <div
                          className={`rounded-2xl border px-3.5 py-2 shadow-sm ${
                            own
                              ? 'rounded-br-md border-transparent bg-bubble-own'
                              : 'rounded-bl-md border-border bg-bubble-other'
                          } ${message.status === 'pending' ? 'border-hold/60' : ''}`}
                        >
                          <p className="whitespace-pre-wrap wrap-break-word text-sm">
                            {message.body}
                          </p>
                          <p className="mt-1 flex items-center justify-end gap-2 text-[10px] text-muted">
                            {message.status === 'pending' && (
                              <span className="font-semibold text-hold">
                                ⏳ pending review
                              </span>
                            )}
                            {timeFormat.format(new Date(message.created_at))}
                          </p>
                        </div>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </>
        )}
      </div>

      {/* Notice strip (pending / errors) */}
      {notice && (
        <p className="border-t border-border bg-hold/10 px-4 py-2 text-xs text-hold">
          {notice}
        </p>
      )}

      {/* Composer */}
      <form
        onSubmit={send}
        className="flex items-end gap-2 border-t border-border bg-surface p-3"
      >
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send(e)
            }
          }}
          rows={1}
          placeholder={`Message ${props.group.name}…`}
          className="max-h-40 min-h-10.5 flex-1 resize-y rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-brand-a"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="h-10.5 shrink-0 rounded-xl px-4 text-sm font-semibold text-white shadow-sm transition-transform enabled:hover:scale-105 disabled:opacity-40"
          style={{
            backgroundImage:
              'linear-gradient(135deg, var(--brand-a), var(--brand-b))',
          }}
        >
          {sending ? '…' : 'Send'}
        </button>
      </form>
    </div>
  )
}

/** "Today", "Yesterday", or "Mon, Aug 4" — only where the day changes. */
function dayLabel(current: string, previous?: string): string | null {
  const day = (iso: string) => new Date(iso).toDateString()
  if (previous && day(previous) === day(current)) return null

  const date = new Date(current)
  const today = new Date()
  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)

  if (date.toDateString() === today.toDateString()) return 'Today'
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}),
  }).format(date)
}

/** Shimmer placeholders while the first page loads (M5-03 skeletons). */
function MessageSkeletons() {
  const widths = ['40%', '55%', '35%', '60%', '45%', '30%']
  return (
    <div className="flex flex-col gap-3 pt-2">
      {widths.map((width, i) => (
        <div
          key={i}
          className={`flex ${i % 3 === 2 ? 'justify-end' : 'justify-start'}`}
        >
          <div className="skeleton h-12" style={{ width }} />
        </div>
      ))}
    </div>
  )
}
