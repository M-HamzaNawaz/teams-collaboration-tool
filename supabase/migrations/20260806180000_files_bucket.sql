-- M7-01: the files bucket — PRIVATE, like everything on this platform.
--
-- No storage RLS policies are created for browser roles ON PURPOSE: with
-- none, the storage API denies every direct client operation, and the only
-- paths to an object are the API routes — upload behind authorize() +
-- detect() (M7-02), download behind authorize() + a 5-minute signed URL
-- (M7-01). Nothing is publicly addressable; no long-lived link survives a
-- member's removal.

insert into storage.buckets (id, name, public)
values ('files', 'files', false)
on conflict (id) do update set public = false;
