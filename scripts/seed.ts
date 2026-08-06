/**
 * Seed (M1-11): two complete workspaces with deliberately overlapping shapes —
 * same-named groups, held/delivered/blocked messages, an archived and a
 * deleted group — so the isolation harness (M1-12) and invariant suite
 * (M1-13) have real cross-tenant bait to test against.
 *
 * Deterministic UUIDs so tests assert against known IDs. Idempotent via
 * ON CONFLICT DO NOTHING (audit entries guarded by a count check — the audit
 * log cannot be truncated, by design).
 *
 * Usage: npm run db:seed  (local stack must be running)
 */
import postgres from 'postgres'

const DATABASE_URL =
  process.env.DATABASE_URL ??
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

// ---------------------------------------------------------------------------
// Deterministic IDs (version-4-shaped, fixed)
// ---------------------------------------------------------------------------
export const SEED = {
  wsA: '00000000-0000-4000-8000-0000000000aa',
  wsB: '00000000-0000-4000-8000-0000000000bb',
  users: {
    // Workspace A — "Acme Digital"
    usman: '00000000-0000-4000-8000-0000000000a1', // admin
    ahmed: '00000000-0000-4000-8000-0000000000a2', // developer
    sarah: '00000000-0000-4000-8000-0000000000a3', // designer, manager of Unipile
    waleed: '00000000-0000-4000-8000-0000000000a4', // client
    // Workspace B — "Bolt Studio"
    bilal: '00000000-0000-4000-8000-0000000000b1', // admin
    omar: '00000000-0000-4000-8000-0000000000b2', // developer
    zara: '00000000-0000-4000-8000-0000000000b3', // client
  },
  groups: {
    unipile: '00000000-0000-4000-8000-000000000101', // A: active
    phoneApp: '00000000-0000-4000-8000-000000000102', // A: archived
    oldSite: '00000000-0000-4000-8000-000000000103', // A: deleted (tombstone)
    boltSite: '00000000-0000-4000-8000-000000000201', // B: active, same-shaped
  },
  messages: {
    delivered: '00000000-0000-4000-8000-000000000301', // A/unipile, visible to all members
    pending: '00000000-0000-4000-8000-000000000302', // A/unipile, held — sender-only
    blocked: '00000000-0000-4000-8000-000000000303', // A/unipile, blocked — sender-only
    archivedMsg: '00000000-0000-4000-8000-000000000304', // A/phoneApp (archived group)
    bDelivered: '00000000-0000-4000-8000-000000000401', // B/boltSite
  },
} as const

const AUTH_USERS: Array<{ id: string; email: string }> = [
  { id: SEED.users.usman, email: 'usman@seed-a.confide.test' },
  { id: SEED.users.ahmed, email: 'ahmed@seed-a.confide.test' },
  { id: SEED.users.sarah, email: 'sarah@seed-a.confide.test' },
  { id: SEED.users.waleed, email: 'waleed@seed-a.confide.test' },
  { id: SEED.users.bilal, email: 'bilal@seed-b.confide.test' },
  { id: SEED.users.omar, email: 'omar@seed-b.confide.test' },
  { id: SEED.users.zara, email: 'zara@seed-b.confide.test' },
]

export async function seed(databaseUrl: string = DATABASE_URL): Promise<void> {
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} })

  try {
    // -- auth.users (trigger mirrors into public.users) ---------------------
    // The token columns MUST be '' rather than their NULL default: GoTrue
    // scans them into Go strings and a NULL breaks every auth call for the
    // row with "Database error querying schema" (500) — which surfaces as
    // "invalid credentials" and is miserable to debug from the outside.
    for (const user of AUTH_USERS) {
      await sql`
        insert into auth.users
          (instance_id, id, aud, role, email, encrypted_password,
           email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
           created_at, updated_at,
           confirmation_token, recovery_token, email_change,
           email_change_token_new, email_change_token_current,
           phone_change, phone_change_token, reauthentication_token)
        values
          ('00000000-0000-0000-0000-000000000000', ${user.id}, 'authenticated',
           'authenticated', ${user.email},
           extensions.crypt('seed-password-123', extensions.gen_salt('bf')),
           now(), '{"provider":"email","providers":["email"]}', '{}',
           now(), now(),
           '', '', '', '', '', '', '', '')
        on conflict (id) do nothing`
    }

    // -- workspaces ---------------------------------------------------------
    await sql`
      insert into public.workspaces (id, name, owner_id) values
        (${SEED.wsA}, 'Acme Digital', ${SEED.users.usman}),
        (${SEED.wsB}, 'Bolt Studio', ${SEED.users.bilal})
      on conflict (id) do nothing`

    // -- profiles (I2: display names are data set by the admin) -------------
    await sql`
      insert into public.profiles
        (user_id, workspace_id, display_name, member_role, role_label) values
        (${SEED.users.usman}, ${SEED.wsA}, 'Usman S.', 'admin', 'Agency Owner'),
        (${SEED.users.ahmed}, ${SEED.wsA}, 'Ahmed K.', 'member', 'Frontend Developer'),
        (${SEED.users.sarah}, ${SEED.wsA}, 'Sarah', 'member', 'Designer'),
        (${SEED.users.waleed}, ${SEED.wsA}, 'Waleed', 'client', 'Client'),
        (${SEED.users.bilal}, ${SEED.wsB}, 'Bilal R.', 'admin', 'Agency Owner'),
        (${SEED.users.omar}, ${SEED.wsB}, 'Omar', 'member', 'Backend Developer'),
        (${SEED.users.zara}, ${SEED.wsB}, 'Zara', 'client', 'Client')
      on conflict (user_id, workspace_id) do nothing`

    // -- groups: active / archived / deleted-tombstone in A, active in B ----
    await sql`
      insert into public.groups
        (id, workspace_id, name, status, created_by, archived_at, deleted_at) values
        (${SEED.groups.unipile}, ${SEED.wsA}, 'Unipile', 'active', ${SEED.users.usman}, null, null),
        (${SEED.groups.phoneApp}, ${SEED.wsA}, 'Phone Delivery App', 'archived', ${SEED.users.usman}, now(), null),
        (${SEED.groups.oldSite}, ${SEED.wsA}, 'Old Site', 'deleted', ${SEED.users.usman}, now(), now()),
        (${SEED.groups.boltSite}, ${SEED.wsB}, 'Unipile', 'active', ${SEED.users.bilal}, null, null)
      on conflict (id) do nothing`

    // -- membership (sarah manages Unipile; waleed is in the archived group too)
    await sql`
      insert into public.group_members
        (group_id, user_id, workspace_id, group_role) values
        (${SEED.groups.unipile}, ${SEED.users.ahmed}, ${SEED.wsA}, 'member'),
        (${SEED.groups.unipile}, ${SEED.users.sarah}, ${SEED.wsA}, 'manager'),
        (${SEED.groups.unipile}, ${SEED.users.waleed}, ${SEED.wsA}, 'member'),
        (${SEED.groups.phoneApp}, ${SEED.users.ahmed}, ${SEED.wsA}, 'member'),
        (${SEED.groups.phoneApp}, ${SEED.users.waleed}, ${SEED.wsA}, 'member'),
        (${SEED.groups.boltSite}, ${SEED.users.omar}, ${SEED.wsB}, 'member'),
        (${SEED.groups.boltSite}, ${SEED.users.zara}, ${SEED.wsB}, 'member')
      on conflict (group_id, user_id) do nothing`

    // -- messages: one of each status in A, plus archived-group + B bait ----
    await sql`
      insert into public.messages
        (id, workspace_id, group_id, sender_id, body, status, delivered_at) values
        (${SEED.messages.delivered}, ${SEED.wsA}, ${SEED.groups.unipile}, ${SEED.users.ahmed},
         'pushed the new build, please review', 'delivered', now()),
        (${SEED.messages.pending}, ${SEED.wsA}, ${SEED.groups.unipile}, ${SEED.users.ahmed},
         'reach me at ahmed.k@gmail.com', 'pending', null),
        (${SEED.messages.blocked}, ${SEED.wsA}, ${SEED.groups.unipile}, ${SEED.users.ahmed},
         'my number is +92 300 1234567', 'blocked', null),
        (${SEED.messages.archivedMsg}, ${SEED.wsA}, ${SEED.groups.phoneApp}, ${SEED.users.waleed},
         'final invoice approved, closing this out', 'delivered', now()),
        (${SEED.messages.bDelivered}, ${SEED.wsB}, ${SEED.groups.boltSite}, ${SEED.users.omar},
         'staging is up for the bolt site', 'delivered', now())
      on conflict (id) do update
        set status = excluded.status, delivered_at = excluded.delivered_at`
    // ^ RESTORE the baseline, don't skip: the escalation timers (M6-04) and
    // moderation actions legitimately change these rows in a live dev db,
    // and the invariant suite depends on message 302 being pending again.

    // -- flags for the held/blocked messages --------------------------------
    await sql`
      insert into public.message_flags
        (workspace_id, message_id, findings_jsonb, action, resolution) values
        (${SEED.wsA}, ${SEED.messages.pending},
         '[{"type":"email","rule_id":"email.standard","match":"ahmed.k@gmail.com"}]',
         'hold', null),
        (${SEED.wsA}, ${SEED.messages.blocked},
         '[{"type":"phone","rule_id":"phone.international","match":"+92 300 1234567"}]',
         'hold', 'blocked')
      on conflict do nothing`

    // -- a file, an invitation, consents, a name-change request -------------
    await sql`
      insert into public.files
        (workspace_id, group_id, message_id, uploader_id, name, mime, size_bytes, storage_path, scan_status) values
        (${SEED.wsA}, ${SEED.groups.unipile}, ${SEED.messages.delivered}, ${SEED.users.ahmed},
         'designs-final-v3.zip', 'application/zip', 1048576,
         ${SEED.wsA + '/' + SEED.groups.unipile + '/designs-final-v3.zip'}, 'clean')
      on conflict do nothing`

    await sql`
      insert into public.invitations
        (workspace_id, group_id, email, display_name, member_role, role_label, token_hash, expires_at, created_by) values
        (${SEED.wsA}, ${SEED.groups.unipile}, 'newdev@seed-a.confide.test',
         'Hassan', 'member', 'Backend Developer',
         ${'a'.repeat(64)}, now() + interval '7 days', ${SEED.users.usman})
      on conflict (token_hash) do nothing`

    await sql`
      insert into public.consents
        (user_id, workspace_id, doc_type, doc_version, ip, user_agent) values
        (${SEED.users.waleed}, ${SEED.wsA}, 'nca', 'v1', '127.0.0.1', 'seed'),
        (${SEED.users.waleed}, ${SEED.wsA}, 'monitoring', 'v1', '127.0.0.1', 'seed'),
        (${SEED.users.zara}, ${SEED.wsB}, 'nca', 'v1', '127.0.0.1', 'seed')
      on conflict (user_id, workspace_id, doc_type, doc_version) do nothing`

    // Conflict target = the one_pending_name_change partial index; a bare
    // ON CONFLICT DO NOTHING matched no constraint and inserted a duplicate
    // on every seed() call.
    await sql`
      insert into public.name_change_requests
        (workspace_id, user_id, requested_name, findings_jsonb, status) values
        (${SEED.wsA}, ${SEED.users.ahmed}, 'Ahmed — the real one', '[]', 'pending')
      on conflict (workspace_id, user_id) where status = 'pending' do nothing`

    // -- audit entries (append-only: only insert on first run) --------------
    const [{ count }] = await sql<[{ count: string }]>`
      select count(*)::text as count from public.audit_log
      where workspace_id in (${SEED.wsA}, ${SEED.wsB})`

    if (Number(count) === 0) {
      const entries = [
        [SEED.wsA, SEED.users.usman, 'Usman S.', null, '', 'workspace.created', '{}'],
        [SEED.wsA, SEED.users.usman, 'Usman S.', SEED.groups.unipile, 'Unipile', 'group.created', '{}'],
        [SEED.wsA, SEED.users.waleed, 'Waleed', null, '', 'consent.accepted', '{"doc_type":"nca","doc_version":"v1"}'],
        [SEED.wsA, SEED.users.ahmed, 'Ahmed K.', SEED.groups.unipile, 'Unipile', 'message.held', '{"finding_types":["email"]}'],
        [SEED.wsA, SEED.users.usman, 'Usman S.', SEED.groups.unipile, 'Unipile', 'message.blocked', '{"finding_types":["phone"]}'],
        [SEED.wsA, SEED.users.usman, 'Usman S.', SEED.groups.phoneApp, 'Phone Delivery App', 'group.archived', '{}'],
        [SEED.wsB, SEED.users.bilal, 'Bilal R.', SEED.groups.boltSite, 'Unipile', 'group.created', '{}'],
      ] as const

      for (const [ws, actor, actorName, groupId, groupName, eventType, payload] of entries) {
        await sql`
          insert into public.audit_log
            (workspace_id, actor_id, actor_display_name, group_id, group_name, event_type, payload_jsonb)
          values (${ws}, ${actor}, ${actorName}, ${groupId}, ${groupName}, ${eventType}, ${payload}::jsonb)`
      }
    }

    console.log('seed complete: 2 workspaces, 7 users, 4 groups, 5 messages')
  } finally {
    await sql.end()
  }
}

// CLI entry
const isDirectRun = process.argv[1]?.replace(/\\/g, '/').endsWith('scripts/seed.ts')
if (isDirectRun) {
  seed().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
