-- M5-02: stream message changes over Realtime (Postgres Changes).
--
-- Only `messages` joins the publication — Realtime evaluates the SELECT RLS
-- policy per subscriber per change, so the member policy (M1-10) IS the
-- delivery rule:
--
--   * INSERT of a delivered row  → group members' sockets get it
--   * INSERT of a pending row    → recipients get NOTHING (status filter);
--                                  the sender and admins see it by policy
--   * approval (M6-02) is UPDATE status → 'delivered' — the same policy now
--     passes and Realtime fans the message out. Approval IS delivery; there
--     is no second mechanism to keep consistent.
--
-- replica identity FULL so RLS can also evaluate UPDATE/DELETE events against
-- the complete row (default identity ships only the primary key).

alter table public.messages replica identity full;

alter publication supabase_realtime add table public.messages;
