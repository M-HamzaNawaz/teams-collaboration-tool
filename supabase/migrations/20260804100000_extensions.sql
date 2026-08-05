-- M1: extensions + app schema for RLS helper functions.

create extension if not exists pgcrypto with schema extensions;

-- Helper-function schema: keeps security-definer helpers out of the public
-- API surface while remaining callable from RLS policies.
create schema if not exists app;
grant usage on schema app to anon, authenticated, service_role;
