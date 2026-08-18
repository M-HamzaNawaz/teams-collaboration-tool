'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef } from 'react'

import { isDesktopShell, shellNotify } from '@/lib/desktop-shell'
import { useDesktopNotifications } from '@/lib/notifications/desktop'
import {
  subscribeToGroupMessages,
  type RealtimeMessage,
} from '@/lib/realtime/messages'
import { browserClient } from '@/lib/supabase/browser-client'

/**
 * Desktop notifications (Tier 1) — the Slack-style "a dev messaged you while
 * you were in VSCode" alert.
 *
 * Always mounted in the shell (not just the open chat), it subscribes to
 * every group the caller belongs to and fires an OS notification when a new
 * message arrives. The rules are the product's, not decoration:
 *
 *  - DELIVERED only. A held message must never surface — that would leak the
 *    contact info the whole system exists to hold back. RLS already keeps
 *    held rows off the recipient's socket, and we re-check status anyway.
 *  - Never your own messages, and only when the app is NOT focused (in the
 *    foreground the in-app unread badges already do the job).
 *  - Sender names come MASKED through the same projected endpoint the chat
 *    uses — a client's notification shows what a client is allowed to see.
 *
 * Renders nothing; it is pure behaviour.
 */
export function NotificationCenter(props: {
  me: { userId: string }
  groups: Array<{ id: string; name: string }>
}) {
  const router = useRouter()
  const { ready } = useDesktopNotifications()
  const readyRef = useRef(ready)
  const notified = useRef<Set<string>>(new Set())
  const groupsRef = useRef(props.groups)

  // Refs mirror the latest values for the async listener without forcing a
  // re-subscribe (writing them in render is a React 19 lint error).
  useEffect(() => {
    readyRef.current = ready
    groupsRef.current = props.groups
  })

  // Re-subscribe only when the set of groups actually changes.
  const groupsKey = props.groups.map((g) => g.id).join(',')

  useEffect(() => {
    if (!ready) return
    const groups = groupsRef.current
    if (groups.length === 0) return

    const supabase = browserClient()
    const channels: ReturnType<typeof subscribeToGroupMessages>[] = []
    const groupName = new Map(groups.map((g) => [g.id, g.name]))
    const senderName = new Map<string, string>()
    let cancelled = false

    function fire(message: RealtimeMessage) {
      if (!readyRef.current) return
      if (message.status !== 'delivered') return
      if (message.sender_id === props.me.userId) return
      // Only when the app isn't the thing you're looking at — hidden tab,
      // minimised window, or another app (VSCode) focused.
      if (document.visibilityState === 'visible' && document.hasFocus()) return
      if (notified.current.has(message.id)) return
      notified.current.add(message.id)

      const who = senderName.get(message.sender_id)
      const where = groupName.get(message.group_id) ?? 'Confide'
      // Desktop shell: native notification via the plugin — the webview's
      // Notification API is a no-op there. (Click-to-open is web-only.)
      if (isDesktopShell()) {
        void shellNotify(
          who ? `${who} · ${where}` : `New message · ${where}`,
          message.body.slice(0, 140),
        )
        return
      }
      try {
        const note = new Notification(who ? `${who} · ${where}` : `New message · ${where}`, {
          body: message.body.slice(0, 140),
          tag: message.group_id, // collapse a burst from one group
          icon: '/icons/icon-192.png',
        })
        note.onclick = () => {
          window.focus()
          router.push(`/app/chat?g=${message.group_id}`)
          note.close()
        }
      } catch {
        // Some engines throw if the page was backgrounded at the wrong
        // moment; a missed toast is not worth a crash.
      }
    }

    async function start() {
      // Realtime must join AS THE USER so RLS scopes what arrives (the same
      // requirement the chat pane documents).
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (cancelled) return
      if (session) await supabase.realtime.setAuth(session.access_token)

      // Masked names, one projected fetch per group — exactly what the chat
      // pane reads, so a client never sees an unmasked identity here either.
      await Promise.all(
        groups.map(async (group) => {
          const response = await fetch(`/api/groups/${group.id}/profiles`)
          if (!response.ok) return
          const data = (await response.json()) as {
            profiles: Array<{ userId: string; displayName?: string }>
          }
          for (const profile of data.profiles) {
            if (profile.displayName) senderName.set(profile.userId, profile.displayName)
          }
        }),
      )
      if (cancelled) return

      for (const group of groups) {
        channels.push(subscribeToGroupMessages(supabase, group.id, fire))
      }
    }
    void start()

    return () => {
      cancelled = true
      for (const channel of channels) void supabase.removeChannel(channel)
    }
  }, [ready, groupsKey, props.me.userId, router])

  return null
}
