-- Explicit data grants — fix-forward for Supabase's deny-by-default change.
--
-- M1-08 (20260804100700_grants.sql) was written against the old Supabase
-- baseline, where every table created by `postgres` auto-granted ALL to anon,
-- authenticated, and service_role — so it only needed to REVOKE. Newer
-- supabase/postgres images (observed on 17.6.1.156) grant NO data privileges
-- by default: after migrations ran, no API role could SELECT anything and
-- service_role could not write at all, which broke every request and the
-- entire db test suite.
--
-- This migration states the intended grant matrix EXPLICITLY. Deny-by-default
-- is an upgrade for this product — nothing is readable or writable unless
-- named here, and the isolation sweep (M1-12) still fails the build if a new
-- table slips through with browser write grants.

-- 1. service_role — the API layer's role (M3): full data access, because every
--    mutation route writes through it behind authorize(). Grants apply to it
--    even though RLS does not.
grant select, insert, update, delete on all tables in schema public
  to service_role;

-- Future tables keep working for the API layer (mirrors the old baseline the
-- design assumed). Browser roles deliberately get NO default privileges.
alter default privileges for role postgres in schema public
  grant select, insert, update, delete on tables to service_role;

-- 2. I3: the audit log stays append-only for EVERYONE. Re-revoke what grant #1
--    just handed back, plus TRUNCATE which the image's default ACL includes.
revoke update, delete, truncate on public.audit_log from service_role;

-- 3. authenticated — read-only, and only the tables the product means members
--    to read (RLS scopes rows on top). The sensitive set from M1-08 — users,
--    invitations, consents, audit_log, message_flags, name_change_requests,
--    role_visibility_rules — is intentionally absent: those are API-only.
grant select on
  public.workspaces,
  public.profiles,
  public.groups,
  public.group_members,
  public.messages,
  public.files
to authenticated;

-- 4. anon — nothing. Under the old defaults anon would have inherited SELECT
--    on non-sensitive tables (blocked only by RLS); deny-by-default closes
--    that layer for good. No grant statement is the statement.
