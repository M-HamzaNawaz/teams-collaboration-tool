# M7 — Files

Private storage with short-lived signed URLs, and filename scanning. File *contents* are out of scope for v1 — an accepted gap, recorded here so it is not later mistaken for a bug.

**Estimate:** 4 days · **Depends on:** M5

---

### M7-01 — Private buckets and signed URLs · `done` · 5 h

**Private buckets only** — nothing on the platform is publicly addressable. Downloads go through an API route that re-checks `authorize()` and mints a 5-minute signed URL on demand.

This is also what makes member removal real for files: no long-lived link keeps working after access is revoked (M3-02).

**Acceptance:** no storage object is reachable without an authorization check; a signed URL is dead five minutes after issue; a removed member's URLs stop working immediately.

**Depends on:** M5-01

---

### M7-02 — Upload with filename scanning · `done` · 6 h

Upload → `authorize()` → **filename through `detect()`** → attach to a message → audit entry. A flagged filename holds the message exactly like flagged text. Limit 100 MB, configurable.

**Acceptance:** uploading `call-me-+923001234567.pdf` holds the message; the file is not delivered while held.

**Depends on:** M7-01, M2-08

---

### M7-03 — Virus scan hook point · `done` · 3 h

`scan_status` transitions (`pending → clean | infected | skipped`) with a stubbed scanner behind an interface. Files stay undelivered until scanning resolves. Stub is acceptable in v1 per spec; the seam is what matters.

**Acceptance:** swapping in a real scanner requires no change outside the adapter.

**Depends on:** M7-02

---

### M7-04 — Inline previews · `todo` · 4 h — **cuttable**

Image thumbnails and inline rendering, PDF first-page preview.

On the cut list (TECHNICAL_PLAN §9.1) — documents-only download links still deliver the feature.

> **Accepted gap:** image *contents* are never scanned in v1. A phone number written on a screenshot passes through untouched, and is likely the most-used bypass. Needs OCR; no phase assigned. Recorded in TECHNICAL_PLAN §10.

**Depends on:** M7-02
