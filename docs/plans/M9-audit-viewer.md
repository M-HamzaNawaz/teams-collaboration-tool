# M9 — Audit Viewer

The audit log is written from M3-05 onward; this milestone makes it readable. It is the product's evidence surface — the thing an agency actually opens when it suspects circumvention.

**Estimate:** 3 days · **Depends on:** M1

---

### M9-01 — Query API · `done` · 4 h

Admin-only, workspace-scoped, filterable by group, member, event type, and date range, with keyset pagination.

Reads the denormalized `actor_display_name` and `group_name` columns (M1-06), so entries stay readable after the user or group they reference is gone.

**Acceptance:** filters compose; an entry for a deleted group still renders a group name; a manager cannot reach the endpoint.

**Depends on:** M1-06

---

### M9-02 — Viewer UI · `done` · 5 h — **partly cuttable**

Table with filters, expandable payload, and CSV export for the dispute case the whole feature exists to serve.

Cut list (TECHNICAL_PLAN §9.1) allows shipping Phase 1 without this UI and querying via SQL during the pilot — but the **writes are not cuttable**, and export is the piece worth keeping if anything is.

**Acceptance:** an admin can reconstruct a full timeline for one member across one group without SQL.

**Depends on:** M9-01

---

### M9-03 — Chain verification job · `done` · 3 h

Scheduled `verify_audit_chain(workspace_id)` (M1-07) with alerting on failure, plus an on-demand run from the viewer.

Turns the hash chain from a stored column into an actual guarantee — an unverified chain proves nothing.

**Acceptance:** a tampered row is detected and named; verification result and timestamp are visible to the admin.

**Depends on:** M1-07
