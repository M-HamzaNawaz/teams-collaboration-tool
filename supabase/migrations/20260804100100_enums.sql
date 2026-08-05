-- M1-01: enums.
--
-- Two role concepts, deliberately separate:
--   member_role — workspace-level PERMISSION role (admin | member | client)
--   group_role  — per-group elevation (manager | member); "one Manager per
--                 group" is a partial unique index on group_members, not code
-- The human-facing label ("Frontend Developer") is profiles.role_label text.

create type public.member_role as enum ('admin', 'member', 'client');
create type public.group_role as enum ('manager', 'member');
create type public.group_status as enum ('active', 'archived', 'deleted');
create type public.message_status as enum ('pending', 'delivered', 'blocked');
create type public.detection_action as enum ('allow', 'flag_only', 'hold');
create type public.flag_resolution as enum ('approved', 'blocked', 'auto_approved');
create type public.scan_status as enum ('pending', 'clean', 'infected', 'skipped');
create type public.consent_doc_type as enum ('nca', 'recording', 'monitoring');
create type public.avatar_status as enum ('none', 'pending', 'approved');
create type public.request_status as enum ('pending', 'approved', 'rejected');
