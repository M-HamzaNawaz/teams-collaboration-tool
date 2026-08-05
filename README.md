# Confide

Agency collaboration platform with a client-protection control layer: masked identities, server-side contact-info detection before message delivery, admin approval of held messages, and an append-only audit trail.

**The chat is the surface. The control layer is the product.** See [PROJECT_SPEC.md](PROJECT_SPEC.md) for what we're building and why, [TECHNICAL_PLAN.md](TECHNICAL_PLAN.md) for how, and [docs/plans/](docs/plans/) for the task breakdown.

## The three invariants

Enforced at the database layer — grants, schema shape, and triggers — not just application code:

1. **No DMs, groups only.** The schema cannot represent a 1:1 conversation.
2. **Identity is admin-controlled.** Members cannot write their own display name or avatar.
3. **Archive ≠ delete; the audit log is permanent.** Group rows are never deleted; `audit_log` rejects UPDATE/DELETE even from the service role.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind · Supabase (Postgres, Auth, Realtime, Storage) · Vitest · Resend

## Getting started

Prereqs: Node 22+, Docker Desktop (for the local Supabase stack).

```bash
npm install
cp .env.example .env.local   # fill in values printed by db:start
npm run db:start             # boots local Supabase, applies migrations
npm run dev                  # http://localhost:3000
```

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Dev server |
| `npm run verify` | Lint + typecheck + unit tests — run before pushing |
| `npm run test:unit` | Pure tests, no Docker needed (includes detection corpus gate) |
| `npm run test:db` | Grant/RLS/invariant tests against the local stack |
| `npm run db:start` / `db:stop` | Local Supabase up / down |
| `npm run db:reset` | Rebuild database from migrations alone |
| `npm run db:diff -- <name>` | Generate a migration from schema changes |
| `npm run db:seed` | Seed two test workspaces (deterministic IDs) |
| `npm run detection:score` | Score the detection engine against the corpus |

## Layout

```
docs/plans/            task breakdown (M0–M10), one file per milestone
supabase/migrations/   sequential, never edited after merge — fix forward
src/lib/detection/     the detection engine: pure, no I/O, corpus-tested
src/lib/env/           Zod-validated env (public/ vs server-only)
src/lib/supabase/      client factories — see "two clients" below
tests/db/              tests of what Postgres itself enforces
```

## The two database clients

- `userClient()` / `browserClient()` — caller's JWT, RLS enforced. **All reads.**
- `serviceClient()` — service-role key, RLS bypassed. **API-route writes only**, always behind `authorize()`. Guarded by `server-only`: importing it from a client component fails the build.

This split is what makes the write path enforceable: the browser's role has no INSERT grant on `messages`, so every message that exists passed through the server-side detection engine first.
