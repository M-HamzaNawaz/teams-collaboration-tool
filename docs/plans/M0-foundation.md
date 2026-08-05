# M0 — Foundation

Repo, tooling, CI, and the two database clients. Nothing here is product code, but the client split in M0-07 is what makes the write-path lockdown enforceable later.

**Estimate:** 3 days · **Depends on:** — · **Blocks:** M1, M2

---

### M0-01 — Scaffold Next.js app · `todo` · 2 h

Next.js 15 App Router, TypeScript strict, Tailwind, ESLint, `src/` layout, `@/*` import alias.

> npm package name must be lowercase (`confide`) — `create-next-app` rejects the capitalised directory name, so scaffold with an explicit name and merge into the repo root.

**Acceptance:** `npm run dev` serves a page; `npm run build` and `npx tsc --noEmit` both pass.

---

### M0-02 — Git init and repo hygiene · `todo` · 1 h

`git init`, `.gitignore` (includes `.env*.local`, `supabase/.temp`, `.next`), `.env.example` documenting every required key, `README.md` stub.

**Acceptance:** clean `git status` after a fresh clone + `npm install`; no secret ever committed.

---

### M0-03 — Supabase local stack · `todo` · 3 h

`supabase init`, Docker-based local stack, `supabase/migrations/` wired up. Scripts: `db:start`, `db:reset`, `db:diff`, `db:push`.

**Acceptance:** `npm run db:reset` rebuilds the database from migrations alone, with no manual steps.

**Depends on:** M0-02

---

### M0-04 — Test runner · `todo` · 3 h

Vitest with two projects: `unit` (pure, fast, no Docker) and `db` (integration, requires the local stack). Separate scripts so unit tests stay runnable without Docker.

**Acceptance:** `npm run test:unit` passes with zero tests and exits 0; `npm run test:db` connects to the local stack.

**Depends on:** M0-03

---

### M0-05 — CI pipeline · `todo` · 3 h

GitHub Actions: lint → typecheck → unit tests → boot Supabase → db tests. Runs on every push and PR.

**Acceptance:** a PR with a type error, a lint error, or a failing test cannot merge.

**Depends on:** M0-04

---

### M0-06 — Env config module · `todo` · 2 h

`src/lib/env.ts` — Zod-validated environment parsing, split into `serverEnv` and `publicEnv`. Throws at boot on a missing or malformed key.

**Acceptance:** removing `SUPABASE_SERVICE_ROLE_KEY` fails at startup with a named error, not at first use with `undefined`.

---

### M0-07 — Database client factories · `todo` · 3 h

Two clients, deliberately separated:

- `userClient()` — the caller's JWT, RLS enforced. Used for all reads.
- `serviceClient()` — service-role key, RLS bypassed. Used only in API route handlers for writes, and **carries the authorization burden** (M3-06).

`serviceClient` lives behind `import 'server-only'` so importing it into a client component fails the build rather than leaking the key.

**Acceptance:** a client component importing `serviceClient` fails `npm run build`; there is a test asserting this.

**Depends on:** M0-06
