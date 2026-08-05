-- M1-06/07: the audit log — I3's permanent record.
--
-- Design properties:
--   * APPEND-ONLY: update/delete/truncate raise, and grants are revoked even
--     from service_role (grants apply to it; only RLS is bypassed).
--   * NO foreign keys: entries must outlive the users, groups, and workspaces
--     they reference. actor_display_name and group_name are text copies so a
--     purged group still renders a readable trail, not "<deleted> did X".
--   * HASH CHAIN: each row commits to the previous one. verify_audit_chain()
--     turns "we have logs" into "we can show the logs were not altered" —
--     the difference between a record and evidence.

create table public.audit_log (
  id bigint generated always as identity primary key,
  workspace_id uuid not null,
  actor_id uuid,
  actor_display_name text not null default '',
  group_id uuid,
  group_name text not null default '',
  event_type text not null,
  payload_jsonb jsonb not null default '{}',
  prev_hash text not null default '',
  row_hash text not null default '',
  created_at timestamptz not null default now()
);

create index audit_log_workspace_idx on public.audit_log (workspace_id, created_at desc);
create index audit_log_group_idx on public.audit_log (group_id) where group_id is not null;

-- Canonical serialization shared by the chain trigger and the verifier.
create or replace function public.audit_row_digest(
  p_prev_hash text,
  p_workspace_id uuid,
  p_actor_id uuid,
  p_actor_display_name text,
  p_group_id uuid,
  p_group_name text,
  p_event_type text,
  p_payload jsonb,
  p_created_at timestamptz
) returns text
language sql
immutable
set search_path = ''
as $$
  select encode(extensions.digest(
    p_prev_hash || '|' || p_workspace_id::text || '|' ||
    coalesce(p_actor_id::text, '') || '|' || p_actor_display_name || '|' ||
    coalesce(p_group_id::text, '') || '|' || p_group_name || '|' ||
    p_event_type || '|' || p_payload::text || '|' ||
    to_char(p_created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),
    'sha256'), 'hex');
$$;

-- Per-workspace chain. The advisory lock serializes concurrent inserts within
-- one workspace so two transactions cannot both claim the same prev_hash.
create or replace function public.audit_log_compute_hash()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prev text;
begin
  perform pg_advisory_xact_lock(hashtext('audit_log:' || new.workspace_id::text));

  select row_hash into prev
  from public.audit_log
  where workspace_id = new.workspace_id
  order by id desc
  limit 1;

  new.prev_hash := coalesce(prev, 'genesis');
  new.row_hash := public.audit_row_digest(
    new.prev_hash, new.workspace_id, new.actor_id, new.actor_display_name,
    new.group_id, new.group_name, new.event_type, new.payload_jsonb,
    new.created_at
  );
  return new;
end;
$$;

create trigger audit_log_hash
  before insert on public.audit_log
  for each row execute function public.audit_log_compute_hash();

-- Immutability: raises on any modification, even from a superuser connection
-- (unless triggers are deliberately disabled — which the chain then exposes).
create or replace function public.audit_log_immutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_log is append-only';
end;
$$;

create trigger audit_log_no_mutate
  before update or delete on public.audit_log
  for each row execute function public.audit_log_immutable();

create trigger audit_log_no_truncate
  before truncate on public.audit_log
  for each statement execute function public.audit_log_immutable();

-- Walks a workspace's chain in insert order; reports the first broken row.
-- Scheduled nightly + on-demand from the audit viewer (M9-03).
create or replace function public.verify_audit_chain(p_workspace_id uuid)
returns table (ok boolean, first_bad_id bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r record;
  expected_prev text := 'genesis';
begin
  for r in
    select * from public.audit_log
    where workspace_id = p_workspace_id
    order by id
  loop
    if r.prev_hash <> expected_prev
       or r.row_hash <> public.audit_row_digest(
            r.prev_hash, r.workspace_id, r.actor_id, r.actor_display_name,
            r.group_id, r.group_name, r.event_type, r.payload_jsonb,
            r.created_at)
    then
      return query select false, r.id;
      return;
    end if;
    expected_prev := r.row_hash;
  end loop;

  return query select true, null::bigint;
end;
$$;
