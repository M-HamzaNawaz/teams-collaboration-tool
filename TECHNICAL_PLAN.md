# Technical Plan — Confide (Agency Collaboration & Client-Protection Platform)

**Version:** 1.0
**Date:** 2026-08-04
**Source spec:** PROJECT_SPEC.md v1.0 (Usman Shabbir)
**Status:** For engineering review — decisions marked ⚠️ need a call before Phase 1 week 2

---

## 0. Framing

The chat is the surface. The control layer is the product.

Every technical decision in this document is evaluated against one question: **can a member get contact information to another member without the platform catching it?** Where the answer is "yes," it is either closed or explicitly logged as an accepted v1 gap (§10).

Three rules are treated as **structural invariants** — not features, but properties the system cannot violate even if application code has a bug. They are enforced at the schema and database-permission level, not just in the API:

| # | Invariant | Enforced by |
|---|---|---|
| **I1** | **No DMs. Groups only.** No private channel exists between any two members. | Schema — no table can represent a 1:1 conversation. Only admins can create groups. |
| **I2** | **Identity is admin-controlled.** Members cannot set their own display name (or avatar — see §4.2). | `REVOKE UPDATE ON profiles` from all member roles. All identity writes go through an admin-authorized API path. |
| **I3** | **Archive ≠ delete. The audit log is permanent.** | `groups.status` soft-state + `REVOKE UPDATE, DELETE ON audit_log` from every role, plus a trigger that raises on modification. |

Each is detailed in §4.

---

## 1. Stack

| Layer | Choice | Note |
|---|---|---|
| Frontend | Next.js 15 (App Router), TypeScript, Tailwind | PWA manifest for mobile install |
| API | Next.js Route Handlers on Vercel | **All mutations go through here.** See §3. |
| Database | Supabase Postgres + Row Level Security | Every table carries `workspace_id` |
| Auth | Supabase Auth (email + password) | Short JWT lifetime — see §5.3 |
| Realtime | Supabase Realtime (Postgres Changes, RLS-filtered) | Migration path to Broadcast noted in §3.3 |
| Storage | Supabase Storage, **private buckets only** | Short-lived signed URLs, never public |
| Email | Resend | Invitations, alerts, digests |
| Detection | In-repo TypeScript module, zero dependencies | Pure function, no I/O — see §6 |
| Calls (Phase 3) | LiveKit or Daily.co | Not in scope for this plan |

**Why Supabase:** auth, RLS, realtime, and storage out of the box compresses Phase 1 by weeks. **Lock-in assessment:** the detection engine, API layer, and UI are portable — only auth, storage, and realtime are Supabase-specific, and each has a standard replacement (Auth.js, S3, a Socket.io server). If we outgrow it, we replace three adapters, not the product.

---

## 2. Data Model

Refinements over the spec's sketch are marked ➕.

```sql
workspaces(id, name, owner_id, settings_jsonb, created_at)

users(id, email, phone, created_at)
  -- Real contact data. NOT readable by the `authenticated` role at all (§7).
  -- Managed by Supabase Auth; we mirror the id.

profiles(user_id, workspace_id, display_name, nickname, role,
         avatar_url, avatar_status, created_at)          -- ➕ avatar_status
  PRIMARY KEY (user_id, workspace_id)                    -- ➕ one identity per workspace
  -- display_name and avatar are admin-controlled (I2)

role_visibility_rules(workspace_id, viewer_role, target_role, visible_fields jsonb)

groups(id, workspace_id, name, status, created_by, created_at,
       archived_at, deleted_at)                          -- ➕ lifecycle timestamps
  status ENUM('active','archived','deleted')             -- soft state, never a row delete

group_members(group_id, user_id, workspace_id, role, joined_at, removed_at)  -- ➕ soft removal

invitations(id, workspace_id, group_id, email, display_name, nickname, role,
            token_hash, expires_at, accepted_at, created_by)
  -- ➕ token_hash = SHA-256(token). The raw token is never stored.

messages(id, workspace_id, group_id, sender_id, body,
         status, created_at, delivered_at)               -- ➕ delivered_at
  status ENUM('pending','delivered','blocked')

message_flags(id, workspace_id, message_id, findings_jsonb,
              action, resolved_by, resolution, resolved_at)  -- ➕ action (hold|flag_only)

files(id, workspace_id, group_id, message_id, uploader_id, name, mime,
      size, storage_path, scan_status, created_at)

name_change_requests(id, workspace_id, user_id, requested_name,       -- ➕ new table (I2)
                     findings_jsonb, status, reviewed_by, reviewed_at)

consents(id, user_id, workspace_id, doc_type, doc_version,
         accepted_at, ip, user_agent)                    -- ➕ ip + UA for evidentiary weight

audit_log(id, workspace_id, actor_id, actor_display_name,             -- ➕ denormalized
          group_id, group_name, event_type, payload_jsonb,
          prev_hash, row_hash, created_at)                            -- ➕ hash chain (§4.3)
  -- APPEND ONLY. No FK cascades. Survives group and user deletion.

milestones(id, workspace_id, group_id, title, amount, status, created_by)  -- Phase 2
```

**Every table has `workspace_id`.** Every RLS policy joins through it. No exceptions — a table without `workspace_id` is a bug.

### 2.1 Why the audit log is denormalized

`audit_log` stores `actor_display_name` and `group_name` as **text copies**, not foreign keys, and has **no FK constraints at all**. Reason: a permanently deleted group and a removed user must still produce a readable audit trail years later. An audit entry that renders as `<deleted> did X in <deleted>` is not evidence.

---

## 3. The Message Write Path

This is the most load-bearing decision in the project. The spec (§9) is explicit: *"clients must never write directly to a delivered messages table. Never trust the client to run detection."*

### 3.1 Options considered

| Option | Verdict |
|---|---|
| **A.** Client inserts `status='pending'`, a Postgres trigger runs detection | ✗ Detection logic in plpgsql is hard to test and impossible to extend to an LLM pass later. The row is written by an untrusted client with client-controlled columns. |
| **B.** Supabase Edge Function (Deno) scans and inserts | ~ Works, but a second runtime and a second deploy pipeline. Detection code lives away from the app and its tests. |
| **C.** Next.js Route Handler scans and inserts with the service-role key | ✓ **Recommended.** One codebase, one language, detection module unit-tested alongside everything else, trivial to add rate limiting and an LLM pass in Phase 2. |

### 3.2 Recommended path (Option C)

```
Client                Next.js API              Detection            Postgres
  │                        │                       │                    │
  ├─ POST /api/messages ──►│                       │                    │
  │                        ├─ authorize(user,group)│                    │
  │                        ├─ detect(body) ───────►│                    │
  │                        │◄── {action, findings} │                    │
  │                        │                       │                    │
  │            action=allow├─ INSERT status='delivered' ───────────────►│
  │            action=hold ├─ INSERT status='pending' + message_flag ──►│
  │                        ├─ INSERT audit_log ────────────────────────►│
  │◄── {id, status} ───────┤                       │                    │
  │                        │                       │                    │
  │◄══════════ Realtime fan-out (delivered rows only) ══════════════════┤
```

**Database permissions that make this non-bypassable:**

```sql
-- The client's key can read messages. It can never write them.
REVOKE INSERT, UPDATE, DELETE ON messages FROM authenticated, anon;
GRANT SELECT ON messages TO authenticated;
```

RLS stays enabled as defense in depth, but the grant above is the real lock: even a compromised client with a valid JWT and a devtools console **cannot** insert a message row. Every message on the platform passed through `detect()`.

Because the API writes with the service-role key (which bypasses RLS), **the API layer owns authorization**. Single choke point: one `authorize(userId, groupId, action)` helper that every mutation route calls. It is the most security-critical function in the codebase and gets a dedicated test file.

### 3.3 Realtime delivery

Subscribe to Postgres Changes on `messages`, filtered by RLS. The member-facing policy:

```sql
CREATE POLICY members_read_delivered ON messages FOR SELECT TO authenticated
USING (
  status = 'delivered'
  AND EXISTS (
    SELECT 1 FROM group_members gm
    JOIN groups g ON g.id = gm.group_id
    WHERE gm.group_id = messages.group_id
      AND gm.user_id = auth.uid()
      AND gm.removed_at IS NULL
      AND g.status = 'active'        -- archived groups vanish from member view (I3)
  )
);
```

Elegant consequence: **admin approval is just `UPDATE messages SET status='delivered'`.** The row becomes visible to the RLS-filtered subscription, and Realtime fans it out automatically. No separate delivery mechanism.

*Scale note:* Postgres Changes evaluates RLS per subscriber per change. At pilot scale (dozens of groups, 3–10 members) this is comfortable. Revisit at ~50 workspaces or first latency complaint — the migration is to server-side Realtime Broadcast, which is a change to the API layer only, not to the schema.

### 3.4 The approved-message ordering problem ⚠️

The spec's acceptance criterion says an approved message delivers *"with original timestamp order preserved"* — so a message held at 9pm and approved at midnight lands back in the scroll at its 9pm position. **Nobody will ever see it.**

This is why the model carries both `created_at` and `delivered_at`. Recommendation: sort by `created_at` (preserving conversational order as specced), but render a subtle "released after review" marker on any message where `delivered_at - created_at > 60s`, and surface it once in the unread indicator. Cheap to build, and it means held-then-approved messages actually reach the recipient's attention.

**Needs a product decision.** Flagging it rather than assuming.

---

## 4. The Three Invariants

### 4.1 I1 — No DMs, groups only

**Schema-level:** `messages.group_id` is `NOT NULL` and references `groups`. There is no `recipient_id`, no `conversation_id`, no nullable second party. *There is no way to represent a private message in this database.* That is deliberate and should stay true — any future schema change adding a nullable recipient is a violation of the product's core premise.

**Creation control:** only workspace admins can create groups. Enforced in `authorize()` and by the absence of any group-creation UI for non-admins.

**Closing the "2-person group as a de facto DM" gap:** an admin *could* create a group containing exactly one client and one developer, which is a DM by another name. Mitigations:
- Every group creation writes an audit entry with the full member list.
- The admin dashboard flags any active group with exactly two members, one client + one team member, as a review item (Phase 2 — cheap to add, worth having).
- Chat in such a group is still fully scanned and logged, so it is not a hole in detection — only in optics.

**No member directory:** RLS on `profiles` restricts SELECT to users sharing at least one active group with the viewer. Combined with the masking projection (§7), a client cannot enumerate the agency's team.

⚠️ **Open question for the lead:** does "no DMs" also cover **team-internal** chat (developer↔developer, admin↔developer)? The spec never states the rule explicitly — it only never lists the feature. Client↔team private chat is unambiguously what we're preventing. If internal DMs are banned too, the team will use Slack for internal talk, which is fine *if it's a decision rather than an accident.* Either way the rule should be written into the spec, because right now it exists only by absence.

### 4.2 I2 — Admin-controlled identity

**Display name:**

```sql
REVOKE UPDATE ON profiles FROM authenticated, anon;
```

Members have no write path to their own display name, at any layer. Admins change it through `PATCH /api/profiles/:id`, which checks role in `authorize()` and writes an audit entry.

**Name change requests:** members may request a change (spec §7). The requested string runs through **the same detection engine** before an admin ever sees it, and any findings are highlighted in the review UI. Without this, the request form is an unscanned channel straight to a field every client can read — a member could request the name `"Ahmed — wa.me/923001234567"` and a distracted admin clicks approve.

**⚠️ The avatar is the gap the spec leaves open.** The invitee uploads their own avatar during onboarding. Images are not scanned in v1 (and OCR is not planned before Phase 2), so a phone number written on the image, or a LinkedIn QR code, reaches every client in the group with zero friction. It defeats the entire identity-masking feature through the one field the member controls.

Three ways to close it:

| Option | Cost | Effect |
|---|---|---|
| **A.** Initials-only avatars in Phase 1; custom avatars uploaded by the admin, like display names | ~0 | Closes it completely. Consistent with "identity is admin-controlled." |
| **B.** Members upload, but the avatar is `pending` until an admin approves it (reuses the approval queue) | Small | Closes it; adds an onboarding round-trip and admin workload |
| **C.** Accept the risk for the pilot, log it | 0 | Leaves the hole open |

**Recommendation: A for Phase 1, B in Phase 2** once the approval queue exists and has been proven in real use. `profiles.avatar_status` is in the model so either can ship without a migration.

### 4.3 I3 — Archive ≠ delete, audit log is permanent

**Group lifecycle** is `active → archived → deleted`, all as `groups.status` — **the row is never deleted.** A tombstone row (name, dates, member history) survives permanent deletion so audit entries referencing the group stay readable.

| State | Members | Admin | Writes |
|---|---|---|---|
| `active` | Full access | Full access | Allowed |
| `archived` | **Invisible** — filtered out by RLS (§3.3) | Full read access | Blocked at RLS *and* API |
| `deleted` | Invisible | Metadata + audit trail only | Blocked; messages and files purged |

Read-only is enforced twice: the RLS INSERT policy requires the parent group be `active`, and `authorize()` checks it before any write. A bug in one layer does not make an archived group writable.

**Permanent deletion** is a distinct admin action behind a type-to-confirm dialog. It deletes message rows and storage objects, sets `status='deleted'`, and writes an audit entry recording what was purged and by whom.

**Audit log immutability — the actual mechanism:**

```sql
-- Grants are checked even for service_role (which bypasses RLS, not grants).
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM authenticated, anon, service_role;

-- Defense in depth: refuse modification even from a superuser connection.
CREATE FUNCTION audit_log_immutable() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'audit_log is append-only'; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_log_no_mutate
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
```

**Hash chain (recommended, ~half a day):** each row stores `prev_hash` and `row_hash = SHA256(prev_hash || row contents)`. A nightly job verifies the chain. This turns "we have logs" into "we can demonstrate the logs were not altered after the fact" — which is the difference between a record and evidence, and the product's entire legal pitch rests on that distinction. Worth the half-day.

**Audit coverage from day one:** every mutation route writes an audit entry — joins, invites, consents, sends, flags, approvals, blocks, uploads, removals, renames, archives, deletions, visibility-rule changes. Retrofitting this later means auditing every route twice; it goes in with the first route, in week 2.

---

## 5. Auth, Sessions, and Revocation

### 5.1 Model

Supabase Auth for email+password. `users` is global; `profiles` is per-workspace — so one person can be a client at two agencies with a different masked identity in each, and no data crosses between them.

### 5.2 Invitations

1. Admin submits email + display name + role. Server generates a 32-byte random token, stores **only** `SHA-256(token)`, emails the raw token as a link.
2. Invitee opens the link → sets a password → uploads avatar (per §4.2 decision) → **consent screen**: one scrollable plain-language page, one checkbox, one continue.
3. On accept: `consents` row written with `doc_version`, `ip`, `user_agent`, and timestamp; `invitations.accepted_at` set; audit entry written.
4. Token is single-use, expires in 7 days, and is invalidated on use.

If the email already has an account, the invite **links** the existing user into the new workspace rather than creating a duplicate (spec §6 edge case).

### 5.3 "Session invalidated within seconds" ⚠️ — the concrete answer

The spec makes this an acceptance criterion, but Supabase JWTs are valid until expiry (default **1 hour**) and are not revocable mid-flight. Removing a member does not, by itself, log them out. Four things together do:

1. **Set JWT expiry to 10 minutes.** Refresh tokens rotate transparently; users notice nothing.
2. **RLS is evaluated per query against `group_members`.** The moment `removed_at` is set, every policy denies. Their JWT stays *valid* but grants access to nothing. **This is what actually satisfies the requirement** — data access stops within one query, not one hour.
3. **Revoke refresh tokens** via `auth.admin.signOut(userId, 'global')` so the JWT cannot be renewed past its 10 minutes.
4. **Storage uses short-lived signed URLs (5 min), private buckets only.** Nothing is publicly addressable, so no already-issued link keeps working.

An open WebSocket may survive briefly; on removal the server broadcasts a `member_removed` event that forces the client to hard-reload into a logged-out state.

---

## 6. Detection Engine

### 6.1 Shape

A pure, dependency-free TypeScript module. No database, no framework, no network. It takes text and returns findings.

```ts
type Finding = {
  type: 'email' | 'phone' | 'payment_handle' | 'social_link' | 'crypto_address'
  rule_id: string
  match: string
  span: [number, number]      // offsets into the ORIGINAL text, for UI highlighting
  confidence: number
}

type Verdict = {
  action: 'allow' | 'flag_only' | 'hold'
  findings: Finding[]
}

export function detect(text: string, config: WorkspaceDetectionConfig): Verdict
```

Pure and synchronous means it is trivially unit-testable against thousands of fixtures in CI, and it can be reused unchanged for message bodies, filenames, name-change requests, group names, and (Phase 3) call transcripts.

### 6.2 Pipeline

1. **Normalize** — lowercase; map Unicode confusables to ASCII (Cyrillic `а` → `a` defeats a one-character bypass); strip zero-width characters; collapse whitespace. Offsets are mapped back to the original string so the admin UI highlights the real text.
2. **Match rules** against both raw and normalized text:
   - Email, including `[at]`, `(at)`, ` at `, ` dot `, `name at gmail dot com`
   - Phone — international formats, spaced/dotted/dashed digits, spelled-out digits ("three zero zero…")
   - Payment handles — PayPal.me, IBAN, Wise, Payoneer, BTC/ETH/TRON addresses
   - Contact links — LinkedIn, wa.me, t.me, Instagram, Facebook, Skype, Discord, Signal
3. **Apply the allowlist** (per-workspace, admin-editable) — the agency's own domain, plus `github.com`, `stripe.com`, `figma.com`, `vercel.com`, `noreply@*`, and similar.
4. **Map to an action.**

### 6.3 Three actions, not two — and why this decides whether the product gets used

The spec's design holds every detection. That will strangle adoption: a developer pasting a stack trace containing `noreply@stripe.com` on a Friday night gets frozen until Monday, and by then the team is on WhatsApp. The platform's own Goal #4 (≥80% of communication in-platform) loses to its Goal #2 (≥95% held).

Three tiers instead:

| Action | Behavior | Example |
|---|---|---|
| `allow` | Delivers normally | `github.com/org/repo`, allowlisted domains |
| `flag_only` | **Delivers immediately**, admin sees it in the dashboard | `noreply@` addresses, a phone number inside a pasted log |
| `hold` | Blocked pending review — the spec's core behavior | A personal email, mobile number, wa.me link, PayPal handle |

The mapping is per-workspace config, so the pilot can start strict and loosen based on real data. This preserves the product's purpose — anything that looks like a person handing over their contact details still holds — while removing the false-positive class that would otherwise drive people off the platform.

⚠️ **Still needs a product decision:** what happens to a held message when no admin is online? Options are an auto-approve timeout (e.g. 4 hours, still flagged for review), escalation to the group's manager, or nothing. Recommendation: **escalate to the group manager after 30 minutes, auto-approve-with-flag after 8 hours, configurable.** Whatever we pick, "held indefinitely with no one watching" is the outcome that kills adoption.

### 6.4 Test corpus — the metric made executable

`detection/__fixtures__/corpus.jsonl`, one case per line:

```json
{"text": "reach me at john@gmail.com", "expect": "hold", "types": ["email"]}
{"text": "my number is +92 300 1234567", "expect": "hold", "types": ["phone"]}
{"text": "see the error from noreply@stripe.com", "expect": "flag_only", "types": ["email"]}
{"text": "PR is up at github.com/acme/api", "expect": "allow", "types": []}
```

**CI gates the build**: ≥95% recall on `hold` cases, <5% false-hold rate on negatives. That is the spec's §11 success metric enforced on every commit rather than measured once at the end.

The corpus should be written by someone **other than** the person who writes the rules — otherwise we are grading our own homework and the 95% is meaningless. ~200 seeded cases before Phase 1 ends, including deliberate obfuscation attempts.

### 6.5 Phase 2 extensibility

The LLM pass (spec P1) slots in behind the same interface: `detectAsync()` runs the deterministic rules first, adds an LLM call for anything that passed, and merges findings. No caller changes. Deterministic rules stay as the fast path and the fallback if the model is unavailable.

### 6.6 What v1 does **not** scan

Message text and filenames only, per spec. Explicitly **not** covered: file contents, image contents, avatars (unless §4.2 option A is taken), and voice. These are listed in §10 as accepted gaps, not oversights.

---

## 7. Identity Masking

`role_visibility_rules(workspace_id, viewer_role, target_role, visible_fields jsonb)` drives a **server-side projection layer**. Masked data never leaves the server:

```ts
function projectProfile(viewer: Member, target: Profile): MaskedProfile
```

Two hard rules:

1. **`users` is not readable by the `authenticated` role at all.** `REVOKE SELECT ON users FROM authenticated`. Real email and phone are reachable only through admin API routes. There is no path where a client's browser receives a field it should not see and merely declines to render it — the data never arrives.
2. Every profile-returning endpoint passes through `projectProfile()`. One function, one test file.

Default rules per spec: clients see first name + last initial + role label; team members see the client's name + company.

---

## 8. Testing Strategy

| Suite | What it proves | Gate |
|---|---|---|
| **Detection corpus** (§6.4) | ≥95% recall, <5% false holds | CI, every commit |
| **Cross-tenant isolation** | For *every table*: a user in workspace B cannot read or write workspace A's rows | CI, every commit |
| **Write-path lockdown** | `authenticated` has no INSERT/UPDATE/DELETE grant on `messages`; no client-side path can create a delivered message | CI |
| **Audit immutability** | UPDATE and DELETE on `audit_log` raise, including via service role; hash chain verifies | CI |
| **Archive read-only** | Writes to an archived group fail at both RLS and API layers | CI |
| **E2E (Playwright)** | invite → consent → send flagged message → sender sees "pending review" → recipient sees nothing → admin approves → recipient receives it | Pre-merge |

The cross-tenant suite is the one that matters most. The spec calls a cross-workspace leak *"company-ending"* — that claim is only backed by a test that actively tries to cause one. It should be generated from the table list so a new table without isolation coverage fails the build.

---

## 9. Build Order & Estimate

Spec build order, with the audit log pulled earlier and detection started in parallel.

| Wk | Work |
|---|---|
| 1 | Repo, CI, migrations tooling, schema v1, RLS foundation, **cross-tenant isolation test harness** |
| 2 | Auth, workspace creation, **audit log threaded into every route from the first one** |
| 3 | Groups (create/archive/delete lifecycle), membership, `authorize()` + its test suite |
| 4 | Invitations, email delivery, consent screen, consent records |
| 5 | **Detection engine + corpus** (standalone, no dependency on chat — can run in parallel from wk 3 if a second person is available) |
| 6–7 | Message write path, Realtime, chat UI, typing indicators, receipts, pagination |
| 8 | Hold/approve queue, admin real-time alerts, sender "pending review" state |
| 9 | File upload, private buckets, signed URLs, filename scanning |
| 10 | Masking projection + visibility rules UI |
| 11 | Audit log viewer, filters |
| 12 | Responsive polish, PWA, E2E suite, bug bar |

### 9.1 Estimate ⚠️

**The spec's 4–6 weeks for one engineer is not achievable at production quality.** Realistic: **10–12 weeks** for one experienced full-stack engineer, or **6–7 weeks** with two.

The gap is mostly the chat layer. "WhatsApp-grade UX" is not one ticket — it is optimistic sending with reconnection and retry, message ordering under concurrency, read receipts, typing indicators, infinite scroll pagination, offline queue, and a mobile layout that genuinely works. That alone is 2–3 weeks. The detection engine plus corpus is another full week if the ≥95% target is real.

**Cut list, in the order I would cut, to reach 6–7 weeks solo:**

1. Read receipts and typing indicators (−4 days) — nice, not core
2. Audit log *viewer* UI; keep the writes, query via SQL during the pilot (−3 days)
3. Visibility rules *editor* UI; ship sane defaults, edit in the DB (−3 days)
4. File sharing → documents only, no inline image previews or thumbnails (−3 days)
5. Group *archive* UI; keep the DB state and lifecycle, admin-only endpoint (−2 days)

**Not cuttable under any schedule pressure**, because each is either the product itself or a security property that is far more expensive to retrofit than to build: the server-side write path (§3), the detection engine (§6), tenant isolation (§8), audit log writes (§4.3), and the consent flow (§5.2).

---

## 10. Accepted v1 Gaps

Named deliberately, so nobody discovers them mid-pilot and treats them as bugs.

| Gap | Impact | Planned |
|---|---|---|
| File **contents** not scanned | A number in a `.txt` or `.docx` passes through | Phase 2 (spec P1) |
| **Images not scanned** | A number in a screenshot passes through — likely the most-used bypass | Needs OCR; no phase assigned yet |
| **Avatars** | Closed if §4.2 option A is taken; open otherwise | Phase 1 decision |
| **Voice/video** | No calls in v1, so no exposure yet; Phase 3 adds transcript scanning | Phase 3 |
| Spelled-out contact info | "double three zero…" — partially handled, not fully | Phase 2 LLM pass |
| Out-of-band channels | Someone reads a number aloud on a call outside the platform | **Unsolvable by design.** Spec §13 accepts this — the product makes bypass high-friction and evidenced, not impossible. |

---

## 11. Decisions Needed ⚠️

Ordered by how much they cost if answered late.

| # | Decision | Recommendation | Needed by |
|---|---|---|---|
| 1 | Held message with no admin online — timeout, escalation, or indefinite hold? (§6.3) | Escalate to group manager at 30 min; auto-approve-with-flag at 8h; configurable | Wk 5 |
| 2 | Avatar policy (§4.2) | Initials-only in Phase 1; member upload with admin approval in Phase 2 | Wk 4 |
| 3 | Does "no DMs" include team-internal chat? (§4.1) | Write the rule into the spec either way | Wk 3 |
| 4 | Approved-message ordering — original position or bottom of chat? (§3.4) | Original position + "released after review" marker | Wk 7 |
| 5 | Timeline — accept 10–12 weeks, add a second engineer, or take the cut list? (§9.1) | Own call; the cut list is ready | Wk 1 |
| 6 | Non-circumvention agreement text (spec Q4, still open) | Placeholder ships; lawyer review before Phase 4 | Non-blocking for build |

Items 1–4 have safe defaults already assumed in this plan, so **work is not blocked** while they are decided — but each gets more expensive to change after the week listed.

---

## 12. Summary for Review

- **The write path is the product.** All mutations go through the Next.js API; the client's database grant physically cannot insert a message. Everything else follows from that.
- **The three invariants are schema-enforced, not policy-enforced.** No DMs is a property of the data model. Admin-controlled identity is a revoked grant. Append-only audit is a grant plus a trigger plus a hash chain.
- **Detection gets three actions, not two.** Holding every match makes the platform unusable; holding the right ones is what the product is for.
- **The estimate is 10–12 weeks solo, not 4–6.** A cut list to reach 6–7 is in §9.1, and the five things that must not be cut are named.
- **Two gaps in the spec worth attention:** the avatar upload is an unscanned channel straight to every client (§4.2), and "no DMs" is currently a rule that exists only by absence (§4.1).
