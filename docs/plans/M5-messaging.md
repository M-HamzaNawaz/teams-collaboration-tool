# M5 — Messaging

The write path and the chat itself. M5-01 is the single most load-bearing task in the project: after it, every message on the platform provably passed through `detect()`.

**Estimate:** 10 days · **Depends on:** M2, M4 · **Blocks:** M6, M7

---

### M5-01 — Server-side write path · `done` · 6 h

`POST /api/messages` → `authorize()` → `detect()` → insert with the resulting status → `audit()`. Writes use `serviceClient()`; the client's grant on `messages` is revoked (M1-08), so no browser can insert one regardless of JWT validity.

- `allow` → `status = 'delivered'`
- `flag_only` → `delivered` + a `message_flags` row
- `hold` → `status = 'pending'` + flag row + admin alert

**Acceptance:** a raw authenticated SQL insert into `messages` fails; every delivered message has passed detection.

**Depends on:** M2-08, M3-06

---

### M5-02 — Realtime fan-out · `done` · 6 h

Postgres Changes on `messages`, RLS-filtered per subscriber. Because the member SELECT policy requires `status = 'delivered'`, **approval is simply `UPDATE messages SET status='delivered'`** and Realtime delivers it — no separate delivery mechanism to build or keep consistent.

Scale note: RLS is evaluated per subscriber per change, which is comfortable at pilot size. Migration path is server-side Broadcast, an API-layer change only.

**Acceptance:** a held message reaches no recipient's socket; on approval it arrives without a refresh, in under a second.

**Depends on:** M5-01

---

### M5-03 — Chat UI shell · `todo` · 8 h

Sidebar plus message pane on desktop, full-screen chat on mobile, tablet in between. Group list, header, composer.

**Acceptance:** usable at 360 px and 1920 px; no horizontal scroll at any width.

**Depends on:** M4-01

---

### M5-04 — Message list · `todo` · 8 h

Reverse-infinite pagination, day separators, timestamps, grouped consecutive messages from one sender, scroll anchoring that survives loading older pages.

Sorted by `created_at` so an approved message returns to its original position (spec §7) — the "released after review" marker that makes it noticeable is M6-05.

**Acceptance:** 5,000 messages scroll smoothly; loading older pages does not jump the viewport.

**Depends on:** M5-03

---

### M5-05 — Composer and pending state · `todo` · 6 h

Optimistic send, then reconcile with the server verdict. A held message stays visible **to its sender** as "pending review" — per the spec's edge case, it must never silently disappear. Blocked messages show the workspace-policy notice.

**Acceptance:** the sender always sees their own message in one of sent / pending / blocked; no state loses it.

**Depends on:** M5-02

---

### M5-06 — Typing indicators and read receipts · `todo` · 4 h — **cuttable**

Realtime presence for typing; per-member read watermarks.

First on the cut list (TECHNICAL_PLAN §9.1). Pleasant, not core.

**Depends on:** M5-02

---

### M5-07 — Reconnection and offline queue · `todo` · 6 h

Detect socket loss, back off and resubscribe, replay missed messages by cursor, queue outbound sends while offline and flush on reconnect with de-duplication.

Not cuttable despite looking like polish — a chat that loses messages on a flaky mobile connection sends the team back to WhatsApp, which is the failure mode the whole product exists to prevent.

**Acceptance:** killing the network for 60 seconds mid-conversation loses nothing in either direction and produces no duplicates.

**Depends on:** M5-05
