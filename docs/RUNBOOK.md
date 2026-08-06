# Confide — Pilot Runbook (M10-04)

Operational procedures for the pilot. One page per thing that goes wrong at 2 a.m.

## Workspace creation (manual, pilot)

1. The agency admin signs up at `/signup` — workspace + admin profile + default
   visibility rules are created in one transaction (`create_workspace_with_admin`).
2. Everyone else joins **by invitation only** (`/app` → group → invite). There is
   no self-serve join, by design (I1/I2).
3. Verify after creation: the admin can log in, create a group, and the
   moderation + audit links appear in their sidebar.

## Logging & incident diagnosis

- All API logs are structured JSON on stdout (`src/lib/log.ts`):
  `{"at":…,"level":"error","event":"message.send_failed","group_id":…}`.
- **Policy: ids only.** No message bodies, emails, phone numbers, tokens, or
  detection findings in any log line — enforced by key-dropping + content
  redaction, unit-tested (`src/lib/log.test.ts`). If a new route logs, it uses
  `logEvent`/`logError`, never `console.log` with request data.
- Diagnosing an incident: filter by `event`, then join `group_id`/`message_id`
  against the database (the data itself stays IN the database).
- Known dev-only exception: with no `RESEND_API_KEY`, invite emails print to
  the dev console including the invite link. Production **throws** instead of
  falling back — never run production without the key.

## Backups

Local/pilot stack (Docker):

```bash
# Nightly dump (schema + data, roles not needed — migrations recreate grants)
docker exec supabase_db_Confide pg_dump -U postgres -d postgres \
  --no-owner --format=custom -f /tmp/confide.dump
docker cp supabase_db_Confide:/tmp/confide.dump backups/confide-$(date +%F).dump
```

Hosted Supabase: daily automatic backups on the dashboard; verify the
**Backups** page shows a run within 24h as part of the weekly check.

## Restore rehearsal (do this BEFORE you need it)

1. `supabase start` a scratch stack (or a second local project).
2. `docker cp` the dump in, then:
   `docker exec supabase_db_Confide pg_restore -U postgres -d postgres --clean --if-exists /tmp/confide.dump`
3. Run the proof battery against the restored database:
   - `npm run test:db` — invariants, isolation, authorize matrix all green
   - `select * from verify_audit_chain('<workspace_id>');` — `ok = t`
     (the hash chain survives a dump/restore byte-for-byte; a broken chain
     means the backup itself was tampered with or truncated)
4. Log the rehearsal date below.

| Rehearsed | By | Result |
|---|---|---|
| 2026-08-06 | initial procedure written | — |

## Health checks

- `GET /login` returns 200 → app up.
- `select 1` on the pooler → database up.
- `select jobname, schedule from cron.job;` → both jobs present
  (`confide-escalations` every minute, `confide-chain-verify` nightly 03:00).
- Audit viewer chain banner shows **verified intact** with a recent timestamp.

## Escalation timers (product decision #1 defaults)

Per-workspace in `workspaces.settings_jsonb.moderation`:
`{"escalate_minutes": 30, "auto_approve_hours": 8}` — change with a plain
UPDATE; takes effect on the next cron tick. Auto-approvals are always
distinguishable (`resolution = 'auto_approved'`, actor `system`).
