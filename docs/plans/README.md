# Confide — Delivery Plan

Task breakdown for Phase 1 (Core MVP), derived from [PROJECT_SPEC.md](../../PROJECT_SPEC.md) and [TECHNICAL_PLAN.md](../../TECHNICAL_PLAN.md).

## Milestones

| ID | Milestone | Tasks | Est. | Depends on |
|---|---|---|---|---|
| [M0](M0-foundation.md) | Foundation — repo, tooling, CI, clients | 7 | 3 d | — |
| [M1](M1-schema-invariants.md) | Schema & invariants — tables, grants, RLS, audit immutability | 13 | 6 d | M0 |
| [M2](M2-detection-engine.md) | Detection engine — rules, corpus, CI gate | 10 | 5 d | M0 |
| [M3](M3-auth-workspace.md) | Auth & workspace — sessions, `authorize()`, audit writer | 6 | 4 d | M1 |
| [M4](M4-groups-invites.md) | Groups & invites — lifecycle, invitations, consent | 7 | 6 d | M3 |
| [M5](M5-messaging.md) | Messaging — write path, realtime, chat UI | 7 | 10 d | M2, M4 |
| [M6](M6-moderation.md) | Moderation — hold queue, approve/block, alerts | 5 | 5 d | M5 |
| [M7](M7-files.md) | Files — private storage, signed URLs, filename scanning | 4 | 4 d | M5 |
| [M8](M8-masking.md) | Masking — visibility rules, projection layer | 4 | 4 d | M4 |
| [M9](M9-audit-viewer.md) | Audit viewer — query API, UI, chain verification | 3 | 3 d | M1 |
| [M10](M10-polish.md) | Polish — responsive, PWA, E2E | 4 | 5 d | all |

**Total: 70 tasks, ~55 working days** (≈11 weeks solo, ≈6–7 weeks with two engineers).

M2 has no dependency on M1 and can run fully in parallel — it is a pure module with no database access. If a second engineer joins, M2 is the clean split.

## Task format

Each task carries an ID (`M0-01`), acceptance criteria, dependencies, and an estimate. A task is sized to be completable in one sitting — half a day to two days. Anything larger gets split.

## Status legend

`todo` · `in progress` · `blocked` · `done`

## Conventions

- **Migrations** are sequential, never edited after merge. Fix forward with a new migration.
- **Every mutation route** writes an audit entry in the same transaction as its write.
- **`serviceClient()` is server-only.** Any import of it from `src/app/**` client components fails the build.
- **Every new table** must appear in the isolation-test table list (M1-12) or CI fails.

## The three invariants

Every task is checked against these. See [TECHNICAL_PLAN.md §0](../../TECHNICAL_PLAN.md).

- **I1 — No DMs, groups only.** No schema change may introduce a way to represent a 1:1 conversation.
- **I2 — Identity is admin-controlled.** Members can never write their own `display_name` or avatar.
- **I3 — Archive ≠ delete; the audit log is permanent.** No code path deletes a group row or mutates `audit_log`.

## Open decisions

Tracked in [TECHNICAL_PLAN.md §11](../../TECHNICAL_PLAN.md). Each has a default assumed here, so no task is blocked — but the listed deadline is when changing it starts to get expensive.

| # | Decision | Assumed default | Blocks |
|---|---|---|---|
| 1 | Held message, no admin online | Escalate at 30 min, auto-approve-with-flag at 8 h | M6-04 |
| 2 | Avatar policy | Initials-only in Phase 1 | M4-05 |
| 3 | Team-internal DMs | Banned (groups only, no exceptions) | M4-01 |
| 4 | Approved-message ordering | Original position + "released" marker | M6-05 |
| 5 | Timeline / headcount | 10–12 weeks solo | — |
