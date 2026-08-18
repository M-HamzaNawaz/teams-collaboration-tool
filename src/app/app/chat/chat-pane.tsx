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
import {
  joinPresence,
  sendRead,
  sendTyping,
} from '@/lib/realtime/presence'
import { browserClient } from '@/lib/supabase/browser-client'
import type { GroupRow } from '@/lib/types'
import { GroupMark } from '@/lib/ui/avatar'
import { prefersReducedMotion } from '@/lib/ui/dismiss'
import {
  ArrowLeftIcon,
  CheckCheckIcon,
  DownloadIcon,
  LockIcon,
  PaperclipIcon,
  UsersIcon,
} from '@/lib/ui/icons'
import { FormattedBody } from '@/lib/ui/message-format'

import { RichComposer } from './rich-composer'

import type { Me } from './chat-shell'
import { GroupActions } from './group-actions'
import { MembersPanel } from './members-panel'

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

/**
 * Client-side mirror of the server's default upload cap (files route,
 * workspace-configurable). Checked BEFORE any bytes leave the machine, so
 * an oversized file is refused instantly instead of after a long doomed
 * upload. The server remains the authority.
 */
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024

/** Client-local id for an optimistic upload bubble (event-time only). */
function makeUploadId(): string {
  return `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/**
 * Client-side message shape (M5-05): server rows plus two local-only states —
 * 'sending' (optimistic, awaiting the verdict) and 'failed' (send didn't
 * reach the server; retryable). The acceptance rule: the sender sees their
 * message in SOME state at every moment; no path loses it.
 */
type ClientMessage = Omit<RealtimeMessage, 'status'> & {
  status: RealtimeMessage['status'] | 'sending' | 'failed'
}

export function ChatPane(props: {
  group: GroupRow
  me: Me
  /** Server-fetched first page — instant paint, no second skeleton. The
      subscribe-then-fetch cycle still runs and reconciles over this. */
  initialMessages?: RealtimeMessage[] | null
  onBack: () => void
  onGroupChanged: () => void
}) {
  const [messages, setMessages] = useState<ClientMessage[] | null>(
    props.initialMessages ?? null,
  )
  const [names, setNames] = useState<Map<string, string>>(new Map())
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  // M5-06/07: presence + connection state.
  const [typingUsers, setTypingUsers] = useState<Map<string, { name: string; at: number }>>(new Map())
  const [reads, setReads] = useState<Map<string, string>>(new Map())
  // Active members minus me — the denominator for "read by everyone" (a
  // group tick only goes blue once every other member's watermark passes).
  const [memberIds, setMemberIds] = useState<string[]>([])
  // Live upload progress per optimistic file bubble (tempId → 0..100).
  const [uploadProgress, setUploadProgress] = useState<Map<string, number>>(
    new Map(),
  )
  // The picked File behind each upload bubble, kept so a FAILED upload can
  // retry as an UPLOAD. Retrying through the text path would post the
  // filename as a message body — a real bug a user hit.
  const uploadFiles = useRef<Map<string, File>>(new Map())
  // M7: message_id → attachment metadata (files RLS-scoped to the group).
  const [attachments, setAttachments] = useState<
    Map<string, { id: string; name: string; sizeBytes: number }>
  >(new Map())
  const attachmentsTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [connected, setConnected] = useState(true)
  const [online, setOnline] = useState(true)
  const [showMembers, setShowMembers] = useState(false)
  // I3: an archived group is read-only for everyone, admins included. The
  // API enforces it; the composer must not pretend otherwise.
  const archived = props.group.status !== 'active'

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
  // M5-06/07 plumbing: replay cursor, presence channel, throttles.
  const newestRef = useRef<string | null>(null)
  const replayRef = useRef<(() => Promise<void>) | null>(null)
  const presenceRef = useRef<ReturnType<typeof joinPresence> | null>(null)
  const wasDropped = useRef(false)
  const lastTypingSent = useRef(0)
  const lastReadSent = useRef(0)

  const upsert = useCallback((incoming: ClientMessage) => {
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

  /** Swap an optimistic temp row for the server's row (id changes). */
  const replaceMessage = useCallback(
    (tempId: string, replacement: ClientMessage) => {
      setMessages((current) =>
        (current ?? [])
          .map((m) => (m.id === tempId ? replacement : m))
          .sort((a, b) => a.created_at.localeCompare(b.created_at)),
      )
    },
    [],
  )

  // ── Subscribe → fetch newest page + member names (that order, M5-02).
  // On re-SUBSCRIBED after a drop, REPLAY missed rows by cursor (M5-07) —
  // whatever happened during the outage never came over the wire.
  useEffect(() => {
    const supabase = browserClient()
    let channel: ReturnType<typeof subscribeToGroupMessages> | null = null
    let cancelled = false

    const replay = async () => {
      if (!newestRef.current) return
      const { data: missed } = await supabase
        .from('messages')
        .select('*')
        .eq('group_id', props.group.id)
        .gt('created_at', newestRef.current)
        .order('created_at', { ascending: true })
        .limit(500)
      for (const row of (missed ?? []) as RealtimeMessage[]) upsert(row)
    }
    replayRef.current = replay

    const refetchAttachments = async () => {
      const { data: fileRows } = await supabase
        .from('files')
        .select('id, message_id, name, size_bytes')
        .eq('group_id', props.group.id)
      setAttachments(
        new Map(
          (fileRows ?? [])
            .filter((f) => f.message_id)
            .map((f) => [
              f.message_id as string,
              {
                id: f.id as string,
                name: f.name as string,
                sizeBytes: f.size_bytes as number,
              },
            ]),
        ),
      )
    }

    // A message arriving over the wire may carry an attachment we don't
    // know yet — debounce a files refetch behind every realtime event.
    const onWireMessage = (message: RealtimeMessage) => {
      upsert(message)
      if (attachmentsTimer.current) clearTimeout(attachmentsTimer.current)
      attachmentsTimer.current = setTimeout(() => void refetchAttachments(), 400)
    }

    // Realtime must join AS THE USER: the subscription filter is validated
    // against columns the subscriber's role can SELECT, and anon can select
    // nothing on messages — joining before the SSR session is restored made
    // Realtime silently reject the subscription ("invalid column for filter
    // group_id" in the db log). Resolve the session, hand the token to
    // Realtime, THEN subscribe.
    async function start() {
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (cancelled) return
      if (session) await supabase.realtime.setAuth(session.access_token)

      channel = subscribeToGroupMessages(
        supabase,
        props.group.id,
        onWireMessage,
        (status) => {
          if (status === 'SUBSCRIBED') {
            setConnected(true)
            if (wasDropped.current) {
              wasDropped.current = false
              void replay()
            }
          } else {
            wasDropped.current = true
            setConnected(false)
          }
        },
      )

      presenceRef.current = joinPresence(supabase, props.group.id, {
        onTyping: (event) => {
          if (event.userId === props.me.userId) return
          setTypingUsers((current) =>
            new Map(current).set(event.userId, {
              name: event.displayName,
              at: Date.now(),
            }),
          )
        },
        onRead: (event) =>
          setReads((current) => new Map(current).set(event.userId, event.at)),
      })
    }
    void start()

    async function load() {
      const [{ data: rows }, maskedResponse, { data: members }] =
        await Promise.all([
          supabase
            .from('messages')
            .select('*')
            .eq('group_id', props.group.id)
            .order('created_at', { ascending: false })
            .limit(FIRST_PAGE),
          // Member identities come MASKED from the server (M8-03) — the
          // browser can no longer read profiles at all.
          fetch(`/api/groups/${props.group.id}/profiles`),
          supabase
            .from('group_members')
            .select('user_id, last_read_at')
            .eq('group_id', props.group.id)
            .is('removed_at', null),
        ])
      const page = ((rows ?? []) as RealtimeMessage[]).reverse()
      setMessages(page)
      oldestRef.current = page[0]?.created_at ?? null
      hasMoreRef.current = page.length === FIRST_PAGE
      setHasMore(hasMoreRef.current)
      const maskedProfiles = maskedResponse.ok
        ? ((await maskedResponse.json()) as {
            profiles: Array<{ userId: string; displayName?: string }>
          }).profiles
        : []
      setNames(
        new Map(
          maskedProfiles.map((p) => [p.userId, p.displayName ?? 'Member']),
        ),
      )
      setReads(
        new Map(
          (members ?? [])
            .filter((m) => m.last_read_at)
            .map((m) => [m.user_id as string, m.last_read_at as string]),
        ),
      )
      setMemberIds(
        (members ?? [])
          .map((m) => m.user_id as string)
          .filter((id) => id !== props.me.userId),
      )
      await refetchAttachments()
    }
    void load()

    // Typing signals fade after 3s of silence.
    const pruner = setInterval(() => {
      setTypingUsers((current) => {
        const cutoff = Date.now() - 3000
        if (![...current.values()].some((t) => t.at < cutoff)) return current
        return new Map([...current].filter(([, t]) => t.at >= cutoff))
      })
    }, 1000)

    return () => {
      cancelled = true
      clearInterval(pruner)
      if (channel) void supabase.removeChannel(channel)
      if (presenceRef.current) void supabase.removeChannel(presenceRef.current)
    }
  }, [props.group.id, props.group.workspace_id, props.me.userId, upsert])

  // Track the replay cursor: newest SERVER row we hold (optimistic ids are
  // client-local and must not become cursors). messagesRef mirrors state for
  // event handlers that must read it without re-subscribing.
  const messagesRef = useRef<ClientMessage[] | null>(null)
  useEffect(() => {
    messagesRef.current = messages
    const newestServer = [...(messages ?? [])]
      .reverse()
      .find((m) => !m.id.startsWith('optimistic-'))
    if (newestServer) newestRef.current = newestServer.created_at
  }, [messages])

  // ── Read watermark (M5-06): advance on load, on focus, and when new
  // messages arrive while the reader is at the bottom. Throttled.
  const markRead = useCallback(() => {
    const now = Date.now()
    if (now - lastReadSent.current < 4000) return
    lastReadSent.current = now
    const at = new Date().toISOString()
    void fetch(`/api/groups/${props.group.id}/read`, { method: 'POST' })
    if (presenceRef.current) {
      sendRead(presenceRef.current, { userId: props.me.userId, at })
    }
  }, [props.group.id, props.me.userId])

  useEffect(() => {
    if (messages?.length && stickToBottom.current) markRead()
  }, [messages, markRead])

  useEffect(() => {
    const onFocus = () => markRead()
    const onOnline = () => {
      setOnline(true)
      // Belt and braces: don't wait for the socket's rejoin backoff — pull
      // whatever landed during the outage by cursor right now (M5-07).
      void replayRef.current?.()
    }
    const onOffline = () => setOnline(false)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    // Initial sync deferred — React 19 lint: no sync setState in effects.
    if (!navigator.onLine) queueMicrotask(() => setOnline(false))
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [markRead])

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

  // The composer grows upward as the user types, shrinking this pane. A
  // reader at the bottom must stay glued to the newest message through
  // that resize — otherwise the expanding box covers the latest bubbles.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const observer = new ResizeObserver(() => {
      if (stickToBottom.current) el.scrollTop = el.scrollHeight
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

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
        if (!isFirstRender && paneRef.current && !prefersReducedMotion()) {
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

  /**
   * Optimistic send (M5-05): the bubble exists the moment the button is hit,
   * in 'sending' state, and is then reconciled with the server's verdict —
   * delivered, pending (held), or failed-with-retry. The draft clears
   * immediately; a failure puts the TEXT back into the bubble's retry, not
   * into the void.
   */
  const deliver = useCallback(
    async (tempId: string, body: string) => {
      let response: Response
      try {
        response = await fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ groupId: props.group.id, body }),
        })
      } catch {
        // Network down — keep the bubble, mark it retryable.
        setMessages((current) =>
          (current ?? []).map((m) =>
            m.id === tempId ? { ...m, status: 'failed' as const } : m,
          ),
        )
        return
      }

      if (response.status === 201) {
        const { message } = (await response.json()) as {
          message: { id: string; status: string; createdAt: string }
        }
        replaceMessage(tempId, {
          id: message.id,
          workspace_id: props.group.workspace_id,
          group_id: props.group.id,
          sender_id: props.me.userId,
          body,
          status: message.status as ClientMessage['status'],
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
        setMessages((current) =>
          (current ?? []).map((m) =>
            m.id === tempId ? { ...m, status: 'failed' as const } : m,
          ),
        )
        setNotice(data?.error ?? 'send failed — tap the message to retry')
      }
    },
    [props.group.id, props.group.workspace_id, props.me.userId, replaceMessage],
  )

  function send(body: string) {
    if (!body || sending) return
    setSending(true)
    setNotice(null)
    stickToBottom.current = true

    const tempId = `optimistic-${Date.now()}-${Math.random().toString(36).slice(2)}`
    upsert({
      id: tempId,
      workspace_id: props.group.workspace_id,
      group_id: props.group.id,
      sender_id: props.me.userId,
      body,
      status: 'sending',
      created_at: new Date().toISOString(),
      delivered_at: null,
    })

    void deliver(tempId, body).finally(() => setSending(false))
  }

  const clearProgress = useCallback((tempId: string) => {
    setUploadProgress((current) => {
      const next = new Map(current)
      next.delete(tempId)
      return next
    })
  }, [])

  /**
   * M7-02: upload a file — it becomes a message whose body is the filename.
   *
   * The bubble appears the instant you pick the file, with a live progress
   * bar, then reconciles to the delivered/held file chip. fetch() can't
   * report upload progress, so the POST goes over XMLHttpRequest — the one
   * place in the app that needs the upload.onprogress event.
   */
  async function uploadFile(file: File) {
    setNotice(null)

    // Refuse oversized files BEFORE uploading — nothing is sent, no bubble
    // appears, the user hears why immediately.
    if (file.size > MAX_UPLOAD_BYTES) {
      setNotice(
        `"${file.name}" is ${formatBytes(file.size)} — more than the 50 MB limit. ` +
          'Share big files via a link instead.',
      )
      return
    }

    stickToBottom.current = true
    const form = new FormData()
    form.set('file', file)
    form.set('groupId', props.group.id)

    const tempId = makeUploadId()
    uploadFiles.current.set(tempId, file)
    upsert({
      id: tempId,
      workspace_id: props.group.workspace_id,
      group_id: props.group.id,
      sender_id: props.me.userId,
      body: file.name,
      status: 'sending',
      created_at: new Date().toISOString(),
      delivered_at: null,
    })
    setUploadProgress((current) => new Map(current).set(tempId, 0))

    let result: { status: number; text: string }
    try {
      result = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open('POST', '/api/files')
        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return
          const pct = Math.round((event.loaded / event.total) * 100)
          setUploadProgress((current) => new Map(current).set(tempId, pct))
        }
        xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText })
        xhr.onerror = () => reject(new Error('network'))
        xhr.send(form)
      })
    } catch {
      setMessages((current) =>
        (current ?? []).map((m) =>
          m.id === tempId ? { ...m, status: 'failed' as const } : m,
        ),
      )
      clearProgress(tempId)
      setNotice('upload failed — check your connection')
      return
    }

    const data = (() => {
      try {
        return JSON.parse(result.text) as {
          message?: {
            id: string
            status: string
            createdAt: string
            fileId: string
            fileName: string
          }
          error?: string
        }
      } catch {
        return null
      }
    })()

    if (result.status === 201 && data?.message) {
      const m = data.message
      uploadFiles.current.delete(tempId) // delivered — no retry needed
      setAttachments((current) =>
        new Map(current).set(m.id, {
          id: m.fileId,
          name: m.fileName,
          sizeBytes: file.size,
        }),
      )
      replaceMessage(tempId, {
        id: m.id,
        workspace_id: props.group.workspace_id,
        group_id: props.group.id,
        sender_id: props.me.userId,
        body: m.fileName,
        status: m.status as ClientMessage['status'],
        created_at: m.createdAt,
        delivered_at: null,
      })
      clearProgress(tempId)
      if (m.status === 'pending') {
        setNotice('Your file is pending review by an admin before delivery.')
      }
    } else {
      setMessages((current) =>
        (current ?? []).map((mm) =>
          mm.id === tempId ? { ...mm, status: 'failed' as const } : mm,
        ),
      )
      clearProgress(tempId)
      setNotice(data?.error ?? 'upload failed')
    }
  }

  /** M7-01: downloads go through the API, which mints a 5-minute URL. */
  async function download(fileId: string) {
    const response = await fetch(`/api/files/${fileId}/download`)
    const data = (await response.json().catch(() => null)) as {
      url?: string
      error?: string
    } | null
    if (response.ok && data?.url) {
      window.open(data.url, '_blank', 'noopener')
    } else {
      setNotice(data?.error ?? 'download failed')
    }
  }

  function retry(message: ClientMessage) {
    if (message.status !== 'failed') return
    setNotice(null)

    // A failed UPLOAD retries as an upload. Routing it through deliver()
    // would post the FILENAME as a text message (a user hit exactly this).
    if (message.id.startsWith('upload-')) {
      const file = uploadFiles.current.get(message.id)
      uploadFiles.current.delete(message.id)
      setMessages((current) =>
        (current ?? []).filter((m) => m.id !== message.id),
      )
      if (file) {
        void uploadFile(file)
      } else {
        // File object lost (page was reloaded mid-failure) — nothing left
        // to resend; ask for a fresh pick instead of faking it.
        setNotice('the upload was interrupted — please attach the file again')
      }
      return
    }

    setMessages((current) =>
      (current ?? []).map((m) =>
        m.id === message.id ? { ...m, status: 'sending' as const } : m,
      ),
    )
    void deliver(message.id, message.body)
  }

  // ── Offline queue flush (M5-07): when connectivity returns, resend every
  // failed message IN ORDER, sequentially. Statuses flip to 'sending'
  // synchronously first, so a second trigger finds nothing to flush — that,
  // plus one deliver() per queued id, is the no-duplicates guarantee.
  useEffect(() => {
    if (!online) return
    // Text messages only: a failed UPLOAD must never flush through
    // deliver(), which would post its filename as a message body. Failed
    // uploads wait for an explicit tap-to-retry (which re-uploads).
    const queued = (messagesRef.current ?? []).filter(
      (m) => m.status === 'failed' && !m.id.startsWith('upload-'),
    )
    if (!queued.length) return
    setMessages((current) =>
      (current ?? []).map((m) =>
        m.status === 'failed' && !m.id.startsWith('upload-')
          ? { ...m, status: 'sending' as const }
          : m,
      ),
    )
    void (async () => {
      for (const message of queued) {
        await deliver(message.id, message.body)
      }
    })()
  }, [online, deliver])

  const timeFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }),
    [],
  )

  // ── Read receipts (M5-06 → WhatsApp ticks). For one of MY OWN delivered
  // messages: 'read' once EVERY other active member's watermark has passed
  // it (blue), 'delivered' while visible but not yet read by all (grey),
  // null otherwise. Date.parse, not string compare — watermarks and rows
  // carry different timezone suffixes. "Seen by whom" moves into the tick's
  // tooltip so a big group stays uncluttered.
  const readStateFor = useCallback(
    (message: ClientMessage): { level: 'read' | 'delivered'; seenBy: string[] } | null => {
      if (message.sender_id !== props.me.userId) return null
      if (message.status !== 'delivered') return null
      const sentAt = Date.parse(message.created_at)
      const seenBy = memberIds
        .filter((id) => {
          const at = reads.get(id)
          return at !== undefined && Date.parse(at) >= sentAt
        })
        .map((id) => names.get(id) ?? 'Member')
      const allRead = memberIds.length > 0 && seenBy.length === memberIds.length
      return { level: allRead ? 'read' : 'delivered', seenBy }
    },
    [memberIds, reads, names, props.me.userId],
  )

  return (
    <div ref={paneRef} className="flex h-full min-w-0 flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 border-b border-border bg-surface p-3">
        <button
          onClick={props.onBack}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-ink-2 hover:bg-hover md:hidden"
          aria-label="Back to groups"
        >
          <ArrowLeftIcon />
        </button>
        <GroupMark name={props.group.name} size={36} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-semibold">{props.group.name}</h2>
          <p className="flex min-w-0 items-center gap-1 text-xs text-muted">
            <span className="shrink-0">
              <LockIcon />
            </span>
            {/* One ellipsized line — on a phone this wrapped to three. */}
            <span className="truncate">
              {archived
                ? 'Archived — read-only'
                : 'Messages are screened for contact info'}
            </span>
          </p>
        </div>
        <button
          onClick={() => setShowMembers(true)}
          aria-label="Group members"
          className="btn btn-secondary px-3 py-1.5"
        >
          <UsersIcon />
          <span className="hidden sm:inline">Members</span>
        </button>
        {props.me.isAdmin && (
          <GroupActions group={props.group} onChanged={props.onGroupChanged} />
        )}
      </header>

      {showMembers && (
        <MembersPanel
          groupId={props.group.id}
          groupName={props.group.name}
          me={props.me}
          onClose={() => setShowMembers(false)}
        />
      )}

      {/* Messages */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto bg-background p-4"
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
                        <span className="rounded-lg bg-surface px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-muted">
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
                        className={`min-w-0 max-w-[85%] md:max-w-[70%] ${
                          firstOfRun && !separator ? 'mt-3' : ''
                        }`}
                      >
                        {firstOfRun && !own && (
                          <p className="mb-1 px-1 text-xs font-semibold text-teal-t">
                            {names.get(message.sender_id) ?? 'Member'}
                          </p>
                        )}
                        <div
                          onClick={() => retry(message)}
                          className={`rounded-xl border px-3.5 py-2 shadow-e1 ${
                            own
                              ? 'rounded-br-md border-transparent bg-bubble-own'
                              : 'rounded-bl-md border-border bg-bubble-other'
                          } ${message.status === 'pending' ? 'border-teal-d/60' : ''} ${
                            message.status === 'sending' ? 'opacity-60' : ''
                          } ${
                            message.status === 'failed'
                              ? 'cursor-pointer border-danger/60'
                              : ''
                          } ${message.status === 'blocked' ? 'opacity-70' : ''}`}
                        >
                          {uploadProgress.has(message.id) ? (
                            // Live upload: filename + a teal progress bar.
                            <div className="min-w-45">
                              <div className="flex items-center gap-2 text-sm">
                                <span className="text-muted">
                                  <PaperclipIcon />
                                </span>
                                <span className="min-w-0 flex-1 truncate font-medium">
                                  {message.body}
                                </span>
                                <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted">
                                  {uploadProgress.get(message.id)}%
                                </span>
                              </div>
                              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                                <div
                                  className="h-full rounded-full bg-teal-d transition-[width] duration-150"
                                  style={{ width: `${uploadProgress.get(message.id)}%` }}
                                />
                              </div>
                              <p className="mt-1 text-[10px] text-muted">
                                Uploading…
                              </p>
                            </div>
                          ) : attachments.has(message.id) ? (
                            // M7: attachment chip instead of raw body text.
                            <button
                              type="button"
                              onClick={() =>
                                message.status === 'delivered' ||
                                message.sender_id === props.me.userId
                                  ? download(attachments.get(message.id)!.id)
                                  : undefined
                              }
                              className="flex w-full min-w-0 items-center gap-2 rounded-lg bg-surface-2/70 px-2.5 py-2 text-left text-sm hover:bg-surface-2"
                            >
                              <span className="shrink-0 text-muted">
                                <PaperclipIcon />
                              </span>
                              <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium">
                                  {attachments.get(message.id)!.name}
                                </span>
                                <span className="block text-[10px] text-muted">
                                  {formatBytes(
                                    attachments.get(message.id)!.sizeBytes,
                                  )}
                                </span>
                              </span>
                              {/* The affordance people actually look for */}
                              {(message.status === 'delivered' ||
                                message.sender_id === props.me.userId) && (
                                <span
                                  className="ml-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-d/15 text-teal-t"
                                  aria-hidden="true"
                                >
                                  <DownloadIcon />
                                </span>
                              )}
                            </button>
                          ) : (
                            <div className="text-sm">
                              <FormattedBody body={message.body} />
                            </div>
                          )}
                          {message.status === 'blocked' && (
                            <p className="mt-1 text-[11px] font-medium text-danger">
                              Not delivered — blocked by workspace policy
                            </p>
                          )}
                          <p className="mt-1 flex items-center justify-end gap-2 text-[10px] text-muted">
                            {message.status === 'pending' && (
                              <span className="rounded bg-sel px-1 font-mono font-medium text-teal-t">
                                pending review
                              </span>
                            )}
                            {/* M6-05: held-then-approved returns to its
                                ORIGINAL position (created_at order) — this
                                marker is what makes it findable there. */}
                            {message.delivered_at &&
                              Date.parse(message.delivered_at) -
                                Date.parse(message.created_at) >
                                60_000 && (
                                <span className="font-medium text-teal-t">
                                  ✓ released after review
                                </span>
                              )}
                            {message.status === 'sending' &&
                              !uploadProgress.has(message.id) && (
                                <span className="font-medium">sending…</span>
                              )}
                            {message.status === 'failed' && (
                              // A real button: keyboards and screen readers
                              // must be able to retry, not just pointers.
                              <button
                                type="button"
                                onClick={(e) => {
                                  // The bubble has its own retry onClick —
                                  // don't fire it twice for one tap.
                                  e.stopPropagation()
                                  retry(message)
                                }}
                                className="font-semibold text-danger underline underline-offset-2"
                              >
                                ⚠ failed — tap to retry
                              </button>
                            )}
                            {message.status !== 'sending' &&
                              message.status !== 'failed' && (
                                <span className="font-mono tabular-nums">
                                  {timeFormat.format(new Date(message.created_at))}
                                </span>
                              )}
                            {/* Read-receipt tick, own delivered messages only:
                                grey ✓✓ = delivered, teal ✓✓ = read by all. */}
                            {own &&
                              (() => {
                                const rs = readStateFor(message)
                                if (!rs) return null
                                return (
                                  <span
                                    className={
                                      rs.level === 'read'
                                        ? 'text-teal-t'
                                        : 'text-muted'
                                    }
                                    title={
                                      rs.seenBy.length
                                        ? `Read by ${rs.seenBy.join(', ')}`
                                        : 'Delivered'
                                    }
                                    aria-label={
                                      rs.level === 'read'
                                        ? 'Read by everyone'
                                        : 'Delivered'
                                    }
                                  >
                                    <CheckCheckIcon />
                                  </span>
                                )
                              })()}
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

      {/* Connection state (M5-07) */}
      {(!online || !connected) && (
        <p className="border-t border-border bg-hold/10 px-4 py-2 text-xs font-medium text-hold">
          {!online
            ? 'Offline — your messages will be sent when you reconnect.'
            : 'Reconnecting…'}
        </p>
      )}

      {/* Typing (M5-06) */}
      {typingUsers.size > 0 && (
        <p className="animate-pulse px-4 pb-1 pt-2 text-xs italic text-muted">
          {[...typingUsers.values()].map((t) => t.name).join(', ')}{' '}
          {typingUsers.size === 1 ? 'is' : 'are'} typing…
        </p>
      )}

      {/* Notice strip (pending / errors) */}
      {notice && (
        <p className="border-t border-border bg-hold/10 px-4 py-2 text-xs text-hold">
          {notice}
        </p>
      )}

      {archived ? (
        <div className="pb-safe border-t border-border bg-surface p-4 text-center text-sm text-muted">
          This group is archived. Its history stays intact, but nobody can
          post here — not even an admin.
        </div>
      ) : (
        <RichComposer
          placeholder={`Message ${props.group.name}…`}
          sending={sending}
          mentions={[...names.entries()]
            .filter(([userId]) => userId !== props.me.userId)
            .map(([userId, name]) => ({ userId, name }))}
          onSend={send}
          onTyping={() => {
            const now = Date.now()
            if (now - lastTypingSent.current > 1500 && presenceRef.current) {
              lastTypingSent.current = now
              sendTyping(presenceRef.current, {
                userId: props.me.userId,
                displayName: props.me.displayName,
              })
            }
          }}
          onAttach={(file) => void uploadFile(file)}
        />
      )}
    </div>
  )
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
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
