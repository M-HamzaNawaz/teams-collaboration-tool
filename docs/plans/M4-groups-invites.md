# M4 — Groups & Invites

Group lifecycle, the invitation flow, and the consent record. Two of the three invariants land visibly here: groups-only (I1) and admin-controlled identity (I2).

**Estimate:** 6 days · **Depends on:** M3 · **Blocks:** M5, M8

---

### M4-01 — Group creation and listing · `done` · 4 h

Admin-only creation. Members list only their own active groups; there is no group directory and no "start a chat" affordance anywhere in the UI.

**I1** — group creation is the *only* way a conversation comes into existence, and only an admin can do it.

**Acceptance:** a non-admin calling the create endpoint gets 403; a member's group list never contains a group they are not in.

---

### M4-02 — Archive, delete, tombstone · `done` · 6 h

`active → archived → deleted`, all as state transitions. Archived is read-only and invisible to members but fully readable by the admin. Permanent deletion sits behind a type-to-confirm dialog, purges messages and files, sets `status = 'deleted'`, and leaves a tombstone row so audit entries referencing the group stay readable.

**I3** — no code path issues `DELETE FROM groups`.

**Acceptance:** writes to an archived group fail at RLS *and* at `authorize()`; after permanent deletion the audit trail still names the group.

**Depends on:** M4-01

---

### M4-03 — Membership and removal · `done` · 5 h

Add and remove members with roles; at most one Manager per group (enforced by a partial unique index, not application code). Removal sets `removed_at`, revokes refresh tokens (M3-02), and broadcasts a `member_removed` event forcing the client to reload into a logged-out state.

**Acceptance:** a removed member loses message, file, and realtime access within seconds; a second Manager on one group is rejected by the database.

**Depends on:** M4-01

---

### M4-04 — Issue invitations · `done` · 5 h

Admin submits email + **display name** + role. Server generates a 32-byte token, stores only `SHA-256(token)`, and emails the raw token via Resend. Seven-day expiry, single use.

**I2** — the display name is set here, by the admin, and the invitee never gets a field to change it.

**Acceptance:** the raw token exists nowhere in the database or logs; a reused or expired token is rejected.

**Depends on:** M4-01

---

### M4-05 — Accept invitation · `done` · 6 h

Open link → set password → avatar step → consent screen → enter. If the email already has an account, **link** it into the workspace rather than creating a duplicate.

**Avatar (decision #2, default assumed):** Phase 1 ships initials-only avatars. Member-uploaded images are an unscanned channel straight to every client in the group — a phone number written on a profile picture defeats identity masking entirely, and v1 has no OCR. `profiles.avatar_status` is already in the schema so the Phase 2 upload-then-approve flow needs no migration.

**Acceptance:** an existing user joining a second workspace gets a second profile and zero data crossover; no member-writable path to an image other members can see.

**Depends on:** M4-04

---

### M4-06 — Consent records · `done` · 3 h

One plain-language scrollable page, one checkbox, one continue — deliberately not a legal wizard (spec Q3). Records `doc_type`, `doc_version`, `accepted_at`, `ip`, `user_agent`, plus an audit entry.

Ships with the placeholder non-circumvention text and a visible "pending legal review" note (spec Q4).

**Acceptance:** entry is impossible without an accepted consent row; the version is recorded so a later revision is distinguishable.

**Depends on:** M4-05

---

### M4-07 — Name change requests · `todo` · 4 h

Members may *request* a new display name; an admin approves. The requested string runs through `detect()` **before an admin ever sees it**, with findings highlighted in the review UI.

Without this the request form is an unscanned channel into a field every client reads — `"Ahmed — wa.me/923001234567"` and a distracted admin clicking approve.

**Acceptance:** a request containing contact info is visibly flagged in the queue; approval writes an audit entry with old and new names.

**Depends on:** M2-08, M4-05
