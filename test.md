# Testing Guide

What tests exist, which ones need Docker, and exactly how to run everything.

## Current situation

| Suite | Needs Docker? | Status |
|---|---|---|
| Unit tests (detection engine, rate limiter, guards) | No | ✅ 38 tests green |
| DB tests (isolation, invariants, authorize matrix) | **Yes** | ✅ 42 tests green locally (Linux ThinkPad, 2026-08-06) |
| Same DB tests in GitHub Actions | No (CI has Docker) | Runs on every push — **first passable commit is `b4584ba`**: before it, newer Supabase images left no data grants and 8 denial tests were structurally unpassable (postgres.js rejects `begin()` on any inner query error, even a caught one) |

> **Machine notes (Linux ThinkPad):** system node is v12 — use `export PATH="$HOME/.local/node22/bin:$PATH"` first. Supabase CLI is at `~/.local/bin/supabase`; `supabase db reset` fails on this CLI version (`LegacyDbBootstrapError`) — apply new migrations with `supabase migration up` instead. The Windows-oriented setup steps below still apply to the other PC.

The db tests assert things **Postgres itself** enforces — grants, Row Level Security, triggers, the audit hash chain. They cannot be simulated without a real database, which is why they need the local Supabase stack, which runs on Docker.

## Run what works today (no Docker)

```powershell
npm run test:unit        # all pure tests, ~1 second
npm run detection:score  # detection scorecard: recall, false holds, per-rule hits
npm run verify           # lint + typecheck + unit tests — run before every push
```

## One-time setup when you get Docker

1. **Install Docker Desktop for Windows** — https://www.docker.com/products/docker-desktop/
   - During install, keep "Use WSL 2" checked (default).
   - After install, start Docker Desktop and wait for the whale icon to settle.
2. **Verify it works:**
   ```powershell
   docker info
   ```
   No error = ready.
3. **Boot the local Supabase stack** (first run downloads images, takes a few minutes):
   ```powershell
   npm run db:start
   ```
   This starts Postgres + Auth + API locally and **applies all migrations** in `supabase/migrations/`. It prints URLs and keys at the end — copy the anon key and service_role key into `.env.local` (template: `.env.example`).

## Run the db tests

```powershell
npm run test:db
```

The suites seed their own data (two fake agency workspaces) automatically. What each file proves:

| File | What it proves |
|---|---|
| `tests/db/isolation.db.test.ts` | **Tenant isolation.** A workspace-B user can see and touch NOTHING of workspace A — swept across every table, and the table list is generated from the database, so a new table without coverage fails the run. |
| `tests/db/invariants.db.test.ts` | **The three invariants.** I1: the schema cannot represent a DM. I2: members can't edit their own names or read real emails. I3: archived groups are read-only and invisible to members; the audit log rejects UPDATE/DELETE even from the service role, and the hash chain detects tampering at the exact row. Plus: a held message is visible to its sender, invisible to recipients. |
| `tests/db/authorize.db.test.ts` | **The permission matrix.** Admin / member / manager / client × every action × every group state — including "admin cannot write into an archived group" and "cross-tenant probes get 404". |

Expected result: everything green. If CI on GitHub is green for the same commit, your local run should match.

## Daily workflow with Docker running

```powershell
npm run db:start    # once per day / after reboot
npm run verify      # before every push (fast)
npm run test:db     # after schema/RLS/seed changes
npm run db:stop     # when done (frees RAM)
```

## When to run which

- **Changed detection rules?** → `npm run test:unit` (the corpus gate is in there)
- **Changed a migration, RLS policy, or the seed?** → `npm run db:reset` then `npm run test:db` (`db:reset` rebuilds the database from migrations alone — proves they apply cleanly from scratch)
- **Changed app code only?** → `npm run verify` is enough; CI covers the rest

## Troubleshooting

| Symptom | Fix |
|---|---|
| `Docker is not running` / `Supabase local stack is not reachable` | Start Docker Desktop, wait for it to finish loading, then `npm run db:start` |
| Port conflict (54321/54322 in use) | `npm run db:stop`, or another Supabase project is running — `npx supabase stop --project-id <other>` |
| Tests fail after you edited a migration | Never edit an applied migration — add a new one. Then `npm run db:reset` |
| Stack is weirdly broken | `npm run db:stop`, then `npm run db:start` — worst case `npx supabase stop --no-backup` for a clean slate (wipes local data; the seed recreates it) |
| `relation does not exist` in tests | Migrations didn't apply — check `npm run db:start` output for a SQL error, fix it, `npm run db:reset` |

## The rule that keeps CI honest

A PR merges only when **both** jobs are green: `Lint, typecheck, unit tests` and `Database invariants`. The db job is the one that catches what TypeScript can't see — SQL syntax, grant gaps, RLS holes. When it fails on GitHub: **Details → red step → read the last lines** — the error names the culprit.
