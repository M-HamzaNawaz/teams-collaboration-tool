import type {
  RealtimeChannel,
  RealtimePostgresChangesPayload,
  SupabaseClient,
} from '@supabase/supabase-js'

import type { MessageStatus } from '@/lib/types'

/**
 * Realtime message subscription (M5-02) — the client half of "approval is
 * delivery".
 *
 * Subscribes to Postgres Changes on `messages` for one group. What arrives
 * is whatever the caller's RLS SELECT policy passes — a held message never
 * reaches a recipient's socket because the policy's status='delivered' arm
 * filters it server-side; when an admin approves, the UPDATE passes policy
 * and lands here. The UI treats INSERT and UPDATE identically: upsert by id
 * (M5-04 sorts by created_at, which puts a released message back at its
 * original position).
 *
 * Security note: this is a filter on data the caller may already read — the
 * RLS policy, not this filter, is the boundary.
 *
 * Gap warning (measured, M5-02 acceptance run): the Postgres Changes
 * listener registers asynchronously AFTER the channel reports SUBSCRIBED —
 * events in that window are silently missed. Callers must fetch the page of
 * messages AFTER subscribing (M5-04) so the fetch covers the warm-up gap;
 * subscribe-then-fetch, never fetch-then-subscribe.
 */

export type RealtimeMessage = {
  id: string
  workspace_id: string
  group_id: string
  sender_id: string
  body: string
  status: MessageStatus
  created_at: string
  delivered_at: string | null
}

/**
 * Connection status surfaced to the UI (M5-07). supabase-js reconnects the
 * socket itself with backoff; the caller's job on re-SUBSCRIBED is to REPLAY
 * missed rows by cursor — events during the outage are gone from the wire.
 */
export type SubscriptionStatus =
  | 'SUBSCRIBED'
  | 'TIMED_OUT'
  | 'CLOSED'
  | 'CHANNEL_ERROR'

/**
 * Unique per-call suffix: supabase-js hands back the SAME channel object
 * for a repeated topic, and adding postgres_changes listeners to an
 * already-subscribed channel throws. The chat pane and the notification
 * center both subscribe to the caller's groups, so topics must never
 * collide — the suffix is client-side naming only, the db filter decides
 * what arrives.
 */
let subscriberSeq = 0

export function subscribeToGroupMessages(
  client: SupabaseClient,
  groupId: string,
  onMessage: (message: RealtimeMessage) => void,
  onStatus?: (status: SubscriptionStatus) => void,
): RealtimeChannel {
  subscriberSeq += 1
  return client
    .channel(`messages:${groupId}:${subscriberSeq}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `group_id=eq.${groupId}`,
      },
      (payload: RealtimePostgresChangesPayload<RealtimeMessage>) => {
        if ('id' in payload.new) onMessage(payload.new)
      },
    )
    .on(
      'postgres_changes',
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'messages',
        filter: `group_id=eq.${groupId}`,
      },
      (payload: RealtimePostgresChangesPayload<RealtimeMessage>) => {
        if ('id' in payload.new) onMessage(payload.new)
      },
    )
    .subscribe((status) => onStatus?.(status as SubscriptionStatus))
}
