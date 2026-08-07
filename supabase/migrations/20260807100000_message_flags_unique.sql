-- One flag row per message — enforced by the database (found while fixing
-- the CI moderation-queue crash: the seed's ON CONFLICT DO NOTHING had no
-- constraint to conflict WITH, so every seed() call quietly inserted a
-- duplicate flag row; same bug class as one_pending_name_change).

-- Housekeeping first: keep the earliest flag per message so the index can
-- build on databases that already accrued duplicates (fresh dbs: no-op).
delete from public.message_flags f
 where exists (
   select 1 from public.message_flags earlier
    where earlier.message_id = f.message_id
      and (earlier.created_at, earlier.id) < (f.created_at, f.id)
 );

create unique index message_flags_one_per_message
  on public.message_flags (message_id);
