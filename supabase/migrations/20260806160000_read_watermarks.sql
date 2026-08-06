-- M5-06: per-member read watermarks.
--
-- One timestamp per membership row — "read up to here" — not a row per
-- message read. At pilot scale a message_reads table is pure overhead, and
-- the product needs receipts ("has the client seen this?"), not analytics.
--
-- Written ONLY via POST /api/groups/:id/read (members hold no UPDATE grant
-- on group_members, M1-08). Deliberately NOT audited: read markers fire on
-- every focus and would bury the evidence trail in noise; the audit log
-- records actions, not attention.

alter table public.group_members
  add column last_read_at timestamptz;
