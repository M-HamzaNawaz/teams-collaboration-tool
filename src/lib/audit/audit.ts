import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * audit() — the audit-log writer (M3-05), threaded into every mutation route
 * from the first one. The hash chain and append-only enforcement live in the
 * database (M1-06/07); this helper's job is making writes uniform and
 * impossible to forget half of.
 *
 * Contract: call AFTER the mutation succeeds, BEFORE responding. A failed
 * audit write THROWS — for this product the evidence trail is the deliverable,
 * so "mutation succeeded but wasn't recorded" must surface as a 500, not a
 * warning. Critical multi-write paths (message send, M5-01) get atomic RPCs
 * instead of separate calls; this helper covers the single-write routes.
 *
 * actor_display_name / group_name are DENORMALIZED copies (M1-06): pass what
 * you already fetched — entries must stay readable after actors and groups
 * are gone.
 */

export type AuditEvent = {
  workspaceId: string
  actorId?: string | null
  actorDisplayName?: string
  groupId?: string | null
  groupName?: string
  /** dot-namespaced: 'workspace.created', 'auth.login', 'group.archived', … */
  eventType: string
  payload?: Record<string, unknown>
}

export async function audit(
  db: SupabaseClient,
  event: AuditEvent,
): Promise<void> {
  const { error } = await db.from('audit_log').insert({
    workspace_id: event.workspaceId,
    actor_id: event.actorId ?? null,
    actor_display_name: event.actorDisplayName ?? '',
    group_id: event.groupId ?? null,
    group_name: event.groupName ?? '',
    event_type: event.eventType,
    payload_jsonb: event.payload ?? {},
  })

  if (error) {
    throw new Error(`audit write failed for ${event.eventType}: ${error.message}`)
  }
}
