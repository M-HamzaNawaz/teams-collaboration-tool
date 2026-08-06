# M10 — Polish & Release Readiness

The gap between "features complete" and "a client will actually use this." Adoption is a stated success metric (≥80% of communication in-platform), which makes this milestone product work, not decoration.

**Estimate:** 5 days · **Depends on:** all

---

### M10-01 — Responsive pass · `done` · 8 h

Every screen at 360 px, 768 px, and 1440 px. Mobile chat is full-screen with a proper back affordance; safe-area insets; keyboard-aware composer on iOS; no horizontal scroll anywhere.

The bar is WhatsApp-grade (spec §7). Clients will judge the product on a phone.

**Acceptance:** every flow completes on a 360 px viewport without zooming or sideways scrolling.

---

### M10-02 — PWA · `done` · 3 h

Manifest, icons, installability, offline shell. Sets up the Phase 3 native path (spec P2) without committing to it.

**Acceptance:** installs to the home screen on Android and iOS and launches standalone.

---

### M10-03 — E2E suite · `todo` · 8 h

Playwright, covering the product's whole reason for existing as one test:

> invite → consent → send a message containing a phone number → sender sees "pending review" → **recipient's client receives nothing** → admin approves → recipient receives it → audit log shows the full chain

Plus: member removal cutting access mid-session, archived group rejecting writes, and a cross-tenant login seeing nothing.

**Acceptance:** the suite runs in CI against a seeded local stack and gates release.

---

### M10-04 — Pilot readiness · `todo` · 5 h

Error monitoring, structured logging with no message bodies or contact data in logs, backup verification, a runbook for the manual workspace creation the pilot uses, and a rehearsed restore.

Logging deserves the attention: a product whose pitch is confidentiality cannot spill message contents into a third-party log aggregator.

**Acceptance:** a staged incident is diagnosable from logs alone, and no log line contains a message body, email, or phone number.
