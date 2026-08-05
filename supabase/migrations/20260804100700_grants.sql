-- M1-08: grant lockdown — the mechanism behind the server-side write path.
--
-- After this migration, the browser's roles (anon, authenticated) cannot
-- WRITE ANY TABLE. Every mutation on the platform goes through the API layer
-- (service_role) behind authorize() — which is why every delivered message
-- provably passed through detect() (M5-01). RLS remains enabled on top as
-- defense in depth, but these grants are the lock: they hold even against a
-- compromised client with a valid JWT and a SQL console.

-- 1. Total write lockdown for browser roles.
revoke insert, update, delete, truncate on all tables in schema public
  from anon, authenticated;

-- Future tables get the same treatment by default; the CI grant sweep
-- (M1-12) fails the build if one slips through with write grants.
alter default privileges for role postgres in schema public
  revoke insert, update, delete, truncate on tables from anon, authenticated;

-- 2. Read lockdown on sensitive tables. users first — real contact data is
-- admin-API-only, which is what makes identity masking structural (M8).
revoke select on public.users from anon, authenticated;
revoke select on public.invitations from anon, authenticated;   -- token hashes, invite emails
revoke select on public.consents from anon, authenticated;      -- served via API
revoke select on public.audit_log from anon, authenticated;     -- admin API only (M9-01)
revoke select on public.message_flags from anon, authenticated; -- findings reveal what evaded masking
revoke select on public.name_change_requests from anon, authenticated;
revoke select on public.role_visibility_rules from anon, authenticated;

-- 3. I3: the audit log is append-only EVEN for the service role. service_role
-- bypasses RLS, not grants — this revoke binds it. The trigger in the
-- previous migration backs this up against superuser connections.
revoke update, delete, truncate on public.audit_log
  from anon, authenticated, service_role;
