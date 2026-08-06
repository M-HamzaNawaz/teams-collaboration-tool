import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'

/**
 * Ephemeral presence per group (M5-06): typing signals and read-watermark
 * pings over Realtime Broadcast. Nothing here is stored or authoritative —
 * typing is transient by nature, and receipts are re-anchored by the
 * database watermark (group_members.last_read_at) whenever the pane loads.
 *
 * self: false — your own typing echo is never interesting.
 */

export type TypingEvent = { userId: string; displayName: string }
export type ReadEvent = { userId: string; at: string }

export function joinPresence(
  client: SupabaseClient,
  groupId: string,
  handlers: {
    onTyping: (event: TypingEvent) => void
    onRead: (event: ReadEvent) => void
  },
): RealtimeChannel {
  return client
    .channel(`presence:${groupId}`, {
      config: { broadcast: { self: false } },
    })
    .on('broadcast', { event: 'typing' }, (message) =>
      handlers.onTyping(message.payload as TypingEvent),
    )
    .on('broadcast', { event: 'read' }, (message) =>
      handlers.onRead(message.payload as ReadEvent),
    )
    .subscribe()
}

export function sendTyping(channel: RealtimeChannel, event: TypingEvent): void {
  void channel.send({ type: 'broadcast', event: 'typing', payload: event })
}

export function sendRead(channel: RealtimeChannel, event: ReadEvent): void {
  void channel.send({ type: 'broadcast', event: 'read', payload: event })
}
