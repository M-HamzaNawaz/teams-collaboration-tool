# M3 — Auth & Workspace

Sessions, the workspace bootstrap, and the two functions every later mutation depends on: `authorize()` and `audit()`.

**Estimate:** 4 days · **Depends on:** M1 · **Blocks:** M4

---

### M3-01 — Supabase Auth wiring · `todo` · 4 h

Email + password auth, SSR session helpers, Next.js middleware for route protection, a typed `getSession()` returning user + workspace + role.

**Acceptance:** an unauthenticated request to any `/app/**` route redirects to login; an authenticated one resolves its workspace and role in a single query.

---

### M3-02 — Short JWT lifetime and revocation · `todo` · 4 h

JWT expiry set to **10 minutes** with transparent refresh-token rotation. Removal revokes refresh tokens via `auth.admin.signOut(userId, 'global')`.

Backs the spec's "session invalidated within seconds" criterion. Note the real mechanism is RLS: once `group_members.removed_at` is set, every policy denies on the next query, so a still-valid JWT grants nothing. The short expiry and token revocation close the renewal path behind it.

**Acceptance:** a removed member's next query returns zero rows; their token cannot be refreshed. Session survives normal use with no visible re-login.

**Depends on:** M3-01

---

### M3-03 — Signup and workspace creation · `todo` · 4 h

Admin signs up → workspace is created → the first user becomes its Admin, in one transaction. Seeds default `role_visibility_rules` (M8-01) and the default detection config (M2-07).

**Acceptance:** a partial failure leaves no orphan workspace or admin-less workspace.

**Depends on:** M3-01

---

### M3-04 — Login, logout, password reset · `todo` · 4 h

Standard flows with rate limiting on login and reset request.

**Acceptance:** reset tokens are single-use and expire; login is rate-limited per email and per IP.

**Depends on:** M3-01

---

### M3-05 — `audit()` writer · `todo` · 4 h

One helper, called in the same transaction as the write it records. Captures actor, workspace, group, event type, payload, and the denormalized display name and group name (M1-06).

Wired into every mutation from the very first one. Retrofitting means auditing every route twice.

**Acceptance:** a mutation route with no `audit()` call fails review; signup, login, and logout already produce entries.

**Depends on:** M1-06

---

### M3-06 — `authorize()` helper · `todo` · 6 h

```ts
authorize(userId, { workspace, group?, action }): Promise<AuthzResult>
```

Because writes go through `serviceClient()` (RLS bypassed), **the API layer owns authorization** — this is the single choke point and the most security-critical function in the codebase.

Checks, in order: workspace membership → group membership → role permission → **group is `active`** (archived groups reject every write, I3).

**Acceptance:** a dedicated test file covering every role × action × group-state combination, including a manager acting outside their own group and any write to an archived group.

**Depends on:** M1-09, M3-01
