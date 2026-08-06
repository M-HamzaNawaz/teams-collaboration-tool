'use client'

import gsap from 'gsap'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import {
  subscribeToGroupMessages,
  type RealtimeMessage,
} from '@/lib/realtime/messages'
import { browserClient } from '@/lib/supabase/browser-client'
import type { GroupRow } from '@/lib/types'
import { accentFor, gradientStyle, initials } from '@/lib/ui/colors'

import type { Me } from './chat-shell'

/**
 * Chat pane (M5-03): header, live message area, composer.
 *
 * Reads run under the caller's OWN RLS via the browser client — delivered
 * messages plus their own pending ones, exactly the policy (M1-10). Sends go
 * through POST /api/messages (M5-01); a 'pending' verdict renders the amber
 * "pending review" state on the sender's own bubble and nowhere else.
 *
 * Ordering: subscribe FIRST, then fetch — the realtime listener registers
 * after SUBSCRIBED, and the fetch covers that gap (measured in M5-02).
 * Deeper list mechanics (pagination, day separators) land in M5-04.
 */

export function ChatPane(props: {
  group: GroupRow
  me: Me
  onBack: () => void
}) {
  const [messages, setMessages] = useState<RealtimeMessage[] | null>(null)
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const paneRef = useRef<HTMLDivElement>(null)

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

  // Subscribe → fetch (that order), plus the group's member names.
  useEffect(() => {
    const supabase = browserClient()
    const channel = subscribeToGroupMessages(supabase, props.group.id, upsert)

    async function load() {
      const [{ data: rows }, { data: profiles }] = await Promise.all([
        supabase
          .from('messages')
          .select('*')
          .eq('group_id', props.group.id)
          .order('created_at', { ascending: true })
          .limit(200),
        supabase
          .from('profiles')
          .select('user_id, display_name')
          .eq('workspace_id', props.group.workspace_id),
      ])
      setMessages((rows ?? []) as RealtimeMessage[])
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

  // Keep the newest message in view; animate its entrance.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
    if (!messages?.length || !paneRef.current) return
    const bubbles = paneRef.current.querySelectorAll('[data-anim="bubble"]')
    const last = bubbles[bubbles.length - 1]
    if (last) {
      gsap.fromTo(
        last,
        { y: 10, opacity: 0, scale: 0.98 },
        { y: 0, opacity: 1, scale: 1, duration: 0.25, ease: 'power2.out' },
      )
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
      // Own pending rows never arrive on the recipient-shaped subscription
      // guarantee — upsert locally so "pending review" is visible at once.
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
        setNotice(
          'Your message is pending review by an admin before delivery.',
        )
      }
    } else {
      const data = (await response.json().catch(() => null)) as {
        error?: string
      } | null
      setNotice(data?.error ?? 'send failed — try again')
    }
    setSending(false)
  }

  const dayStamp = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      }),
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
          <p className="text-xs text-muted">Messages are screened for contact info</p>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        {messages === null ? (
          <MessageSkeletons />
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <p className="text-sm text-muted">
              No messages yet — say hello to the team.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {messages.map((message, i) => {
              const own = message.sender_id === props.me.userId
              const prev = messages[i - 1]
              const firstOfRun = !prev || prev.sender_id !== message.sender_id
              return (
                <li
                  key={message.id}
                  data-anim="bubble"
                  className={`flex ${own ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] md:max-w-[70%] ${firstOfRun ? 'mt-3' : ''}`}>
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
                      <p className="whitespace-pre-wrap break-words text-sm">
                        {message.body}
                      </p>
                      <p className="mt-1 flex items-center justify-end gap-2 text-[10px] text-muted">
                        {message.status === 'pending' && (
                          <span className="font-semibold text-hold">
                            ⏳ pending review
                          </span>
                        )}
                        {dayStamp.format(new Date(message.created_at))}
                      </p>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
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
          className="max-h-40 min-h-[42px] flex-1 resize-y rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none focus:border-brand-a"
        />
        <button
          type="submit"
          disabled={sending || !draft.trim()}
          className="h-[42px] shrink-0 rounded-xl px-4 text-sm font-semibold text-white shadow-sm transition-transform enabled:hover:scale-105 disabled:opacity-40"
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
