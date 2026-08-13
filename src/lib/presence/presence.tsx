'use client'

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'

import { browserClient } from '@/lib/supabase/browser-client'

/**
 * Workspace presence (Slack-style online dots).
 *
 * One Realtime *presence* channel per workspace: each client tracks itself,
 * and the synced state is the set of user ids currently connected. It's
 * ephemeral — nothing is stored, and a closed tab drops out automatically.
 *
 * The channel may carry ids the viewer can't otherwise see, but presence
 * only ever surfaces as a dot on a person the viewer is ALREADY shown (their
 * groups' members), and a bare UUID is not identity — so this leaks nothing
 * the masking layer protects.
 */

const OnlineContext = createContext<Set<string>>(new Set())

export function useOnlineUsers(): Set<string> {
  return useContext(OnlineContext)
}

export function PresenceProvider(props: {
  workspaceId: string
  me: { userId: string }
  children: ReactNode
}) {
  const [online, setOnline] = useState<Set<string>>(new Set())

  useEffect(() => {
    const supabase = browserClient()
    let channel: ReturnType<typeof supabase.channel> | null = null
    let cancelled = false

    async function start() {
      // Join AS THE USER, consistent with the rest of the realtime code.
      const {
        data: { session },
      } = await supabase.auth.getSession()
      if (cancelled) return
      if (session) await supabase.realtime.setAuth(session.access_token)

      channel = supabase.channel(`presence:ws:${props.workspaceId}`, {
        config: { presence: { key: props.me.userId } },
      })
      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel?.presenceState() ?? {}
          setOnline(new Set(Object.keys(state)))
        })
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') void channel?.track({ at: Date.now() })
        })
    }
    void start()

    return () => {
      cancelled = true
      if (channel) void supabase.removeChannel(channel)
    }
  }, [props.workspaceId, props.me.userId])

  return (
    <OnlineContext.Provider value={online}>
      {props.children}
    </OnlineContext.Provider>
  )
}
