# M1 — Schema & Invariants

The database layer, and the point at which the three invariants stop being policy and become properties of the system. Most of the security value of the product is created in this milestone.

**Estimate:** 6 days · **Depends on:** M0 · **Blocks:** M3, M9

---

### M1-01 — Enums, workspaces, users, profiles · `todo` · 3 h

Enums (`group_status`, `message_status`, `member_role`, `scan_status`, `consent_doc_type`, `detection_action`). Tables: `workspaces`, `users` (mirrors auth, holds real email/phone), `profiles` (PK `(user_id, workspace_id)`).

**Acceptance:** `npm run db:reset` applies cleanly; every table has `workspace_id` except `workspaces` and `users`.

---

### M1-02 — Groups and membership · `todo` · 2 h

`groups` with `status ∈ (active, archived, deleted)` plus `archived_at` / `deleted_at`. `group_members` with `removed_at` for soft removal.

**I1 + I3:** `messages.group_id` will be `NOT NULL` with no recipient column (M1-04), and no code path may `DELETE FROM groups`.

**Acceptance:** archiving and deleting are state transitions; the row survives both.

**Depends on:** M1-01

---

### M1-03 — Invitations and consents · `todo` · 2 h

`invitations` storing `token_hash` only (never the raw token), with `expires_at` and `accepted_at`. `consents` with `doc_type`, `doc_version`, `accepted_at`, `ip`, `user_agent`.

**Acceptance:** no column anywhere can hold a usable invite token.

**Depends on:** M1-01

---

### M1-04 — Messages and flags · `todo` · 2 h

`messages(id, workspace_id, group_id NOT NULL, sender_id, body, status, created_at, delivered_at)`. `message_flags(message_id, findings_jsonb, action, resolution, resolved_by, resolved_at)`.

**I1:** no `recipient_id`, no `conversation_id`, no nullable second party. A private message is not representable.

**Acceptance:** a schema review confirms there is no way to address a message to a person rather than a group.

**Depends on:** M1-02

---

### M1-05 — Files and name change requests · `todo` · 2 h

`files` with `scan_status`. `name_change_requests(user_id, requested_name, findings_jsonb, status, reviewed_by, reviewed_at)` — the requested string is scanned before an admin sees it (M4-07).

**Acceptance:** both tables carry `workspace_id` and appear in the isolation list.

**Depends on:** M1-01

---

### M1-06 — Audit log + immutability · `todo` · 4 h

Append-only `audit_log`. Denormalized `actor_display_name` and `group_name` as text, **no foreign keys** — entries must stay readable after the user or group is deleted.

```sql
REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM authenticated, anon, service_role;
CREATE TRIGGER audit_log_no_mutate BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
```

**I3.** Grants block `service_role` (which bypasses RLS but not grants); the trigger blocks even a superuser connection.

**Acceptance:** `UPDATE audit_log` and `DELETE FROM audit_log` both raise, as service role and as postgres. Covered by M1-13.

**Depends on:** M1-01

---

### M1-07 — Audit hash chain · `todo` · 4 h

`prev_hash` / `row_hash` columns, a `BEFORE INSERT` trigger computing `row_hash = sha256(prev_hash || canonical row)`, and a `verify_audit_chain(workspace_id)` function.

Turns "we have logs" into "we can show the logs were not altered" — the distinction the product's legal pitch depends on.

**Acceptance:** the verifier passes on a clean chain; manually forcing a row change (as postgres, trigger disabled) makes it fail at the right row.

**Depends on:** M1-06

---

### M1-08 — Grant lockdown · `todo` · 3 h

The mechanism behind the write path:

```sql
REVOKE INSERT, UPDATE, DELETE ON messages FROM authenticated, anon;  -- write path
REVOKE UPDATE ON profiles FROM authenticated, anon;                  -- I2
REVOKE SELECT ON users FROM authenticated, anon;                     -- real contact data
```

**Acceptance:** an authenticated client with a valid JWT and a raw SQL console cannot insert a message, rename itself, or read any email address. Covered by M1-13.

**Depends on:** M1-04

---

### M1-09 — RLS helper functions · `todo` · 3 h

`is_workspace_member(ws)`, `is_workspace_admin(ws)`, `is_active_group_member(gid)`, `can_manage_group(gid)`. `STABLE` and `SECURITY DEFINER`, indexed lookups — these run on every policy evaluation.

**Acceptance:** each helper has a direct unit test; policy evaluation stays off sequential scans.

**Depends on:** M1-02

---

### M1-10 — RLS policies · `todo` · 6 h

`ENABLE ROW LEVEL SECURITY` on every table, plus policies. Key ones:

- `messages` SELECT: `status = 'delivered'` **and** active membership **and** `groups.status = 'active'` — this single policy makes approval-equals-delivery work (M6-02) and hides archived groups from members (I3).
- `profiles` SELECT: only users sharing an active group with the viewer — no member directory.
- Admin policies scoped to `workspace_id`. Never a bare `USING (true)`.

**Acceptance:** M1-12 and M1-13 pass.

**Depends on:** M1-09

---

### M1-11 — Seed script · `todo` · 3 h

Two full workspaces (A and B) with overlapping shapes: same email in both, groups with identical names, archived and deleted groups, held and delivered messages. Deterministic UUIDs so tests can assert against them.

**Acceptance:** `npm run db:seed` is idempotent against a fresh reset.

**Depends on:** M1-10

---

### M1-12 — Cross-tenant isolation harness · `todo` · 6 h

Enumerates tables from `information_schema`, and for each attempts SELECT / INSERT / UPDATE / DELETE as a workspace-B user against workspace-A rows. **A new table with no isolation coverage fails CI** — the list is generated, not hand-maintained.

The spec calls a cross-workspace leak company-ending; this is the test that backs the claim.

**Acceptance:** every table is covered; every cross-tenant operation returns zero rows or raises.

**Depends on:** M1-11

---

### M1-13 — Invariant test suite · `todo` · 4 h

Direct tests of the three invariants:

- **I1** — no schema path represents a 1:1 message; only admins can create groups
- **I2** — `authenticated` cannot UPDATE `profiles`; cannot SELECT `users`
- **I3** — `audit_log` UPDATE/DELETE raise (incl. as service role); writes to an archived group fail at RLS *and* API; no code path deletes a `groups` row
- **Write path** — `authenticated` has no INSERT on `messages`

**Acceptance:** all pass; each failure message names the invariant it broke.

**Depends on:** M1-12
