# M6 — Moderation

The admin's cockpit: the hold queue, approve/block, and the real-time alert. This is where the control layer becomes visible to the person who bought the product.

**Estimate:** 5 days · **Depends on:** M5

---

### M6-01 — Hold queue · `todo` · 6 h

Admin and group-manager view of pending messages: flagged spans highlighted in the original text, sender, group, timestamp, waiting time. Managers see only their own group; admins see everything in the workspace.

**Acceptance:** a manager cannot see or act on another group's queue; highlight offsets line up exactly with what the sender typed (M2-02).

**Depends on:** M5-01

---

### M6-02 — Approve and block · `todo` · 4 h

Approve → `status = 'delivered'`, which Realtime fans out automatically (M5-02). Block → `status = 'blocked'`, sender notified it was blocked by workspace policy. Both write `message_flags.resolution` and an audit entry.

**Acceptance:** approval delivers to every member in under a second; a blocked message never reaches a recipient and the sender is told.

**Depends on:** M6-01

---

### M6-03 — Real-time admin alerts · `todo` · 5 h

In-app toast plus a badge on hold, and an email fallback when no admin session is active. Spec target: **visible to the admin within 5 seconds** of the send.

**Acceptance:** measured p95 alert latency under 5 s; an offline admin receives the email.

**Depends on:** M6-01

---

### M6-04 — Escalation and timeout · `todo` · 5 h — **decision #1**

Held messages cannot sit forever with nobody watching. Assumed default: escalate to the group manager at **30 minutes**, auto-approve-with-flag at **8 hours**, both configurable per workspace.

This is the adoption valve. Without it, a stack trace sent on Friday night freezes the conversation until Monday and the team moves to WhatsApp — the exact outcome the product exists to prevent. Auto-approved messages stay flagged and audited, so nothing escapes the record.

**Acceptance:** timers are workspace-configurable; auto-approval is distinguishable from a human approval in both the audit log and the admin UI.

**Depends on:** M6-02

---

### M6-05 — "Released after review" marker · `todo` · 3 h — **decision #4**

The spec preserves original timestamp order on approval, so a message held at 9 pm and approved at midnight lands back at its 9 pm position — where nobody will ever see it.

Using `delivered_at`, mark any message where `delivered_at - created_at > 60 s` and surface it once in the unread indicator. Keeps the specced ordering while making the message actually arrive in someone's attention.

**Acceptance:** an approved message is visibly distinguishable in the scroll and drives an unread badge.

**Depends on:** M6-02
