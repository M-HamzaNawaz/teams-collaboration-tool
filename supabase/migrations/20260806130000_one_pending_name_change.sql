-- M4-07: at most ONE pending name-change request per person per workspace —
-- enforced by the database, like one_manager_per_group (M1-02). The API's
-- 409 is just this index's error translated.
--
-- Found the hard way: the route's application-level precheck used a
-- .maybeSingle() that errors (and was ignored) once duplicates existed, and
-- the seed's ON CONFLICT DO NOTHING was a no-op with no unique constraint to
-- conflict WITH — every db-test run inserted another pending duplicate.

-- Housekeeping first so the index can build on databases that already
-- accrued duplicates (fresh databases: no-op). Keep the newest per person,
-- reject the rest — rejected is an inert terminal state.
update public.name_change_requests n
   set status = 'rejected'
 where n.status = 'pending'
   and exists (
     select 1 from public.name_change_requests newer
      where newer.workspace_id = n.workspace_id
        and newer.user_id = n.user_id
        and newer.status = 'pending'
        and (newer.created_at, newer.id) > (n.created_at, n.id)
   );

create unique index one_pending_name_change
  on public.name_change_requests (workspace_id, user_id)
  where status = 'pending';
