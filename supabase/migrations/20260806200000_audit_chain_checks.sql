-- M9-03: the chain verification JOB — an unverified chain proves nothing.
--
-- One status row per workspace (latest result), refreshed nightly by
-- pg_cron and on demand from the viewer. This is operational status, not
-- evidence — hence a plain upsert table, not an append-only log.

create table public.audit_chain_checks (
  workspace_id uuid primary key references public.workspaces (id),
  ok boolean not null,
  first_bad_id bigint,
  checked_at timestamptz not null default now()
);

-- Browser roles get nothing (checked via the admin API); service_role full.
revoke all on public.audit_chain_checks from anon, authenticated;
grant select, insert, update, delete on public.audit_chain_checks to service_role;
alter table public.audit_chain_checks enable row level security;

-- Close a default-grant gap from M1: verify_audit_chain() was PUBLIC-
-- executable. Chain status is admin-surface information.
revoke execute on function public.verify_audit_chain(uuid)
  from public, anon, authenticated;
grant execute on function public.verify_audit_chain(uuid) to service_role;

-- Verify every workspace; store results; scream on failure.
create or replace function public.verify_all_audit_chains()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  w record;
  v record;
  v_failed int := 0;
  v_checked int := 0;
begin
  for w in select id from public.workspaces loop
    select * into v from public.verify_audit_chain(w.id);

    insert into public.audit_chain_checks (workspace_id, ok, first_bad_id, checked_at)
    values (w.id, v.ok, v.first_bad_id, now())
    on conflict (workspace_id)
      do update set ok = excluded.ok,
                    first_bad_id = excluded.first_bad_id,
                    checked_at = excluded.checked_at;

    v_checked := v_checked + 1;
    if not v.ok then
      v_failed := v_failed + 1;
      -- Alert open admin dashboards immediately. (The failure also stands
      -- in audit_chain_checks for the viewer's status banner.)
      perform realtime.send(
        jsonb_build_object('workspace_id', w.id, 'first_bad_id', v.first_bad_id),
        'chain_failed',
        'workspace:' || w.id || ':moderation',
        false);
    end if;
  end loop;

  return jsonb_build_object('checked', v_checked, 'failed', v_failed);
end;
$$;

revoke execute on function public.verify_all_audit_chains()
  from public, anon, authenticated;
grant execute on function public.verify_all_audit_chains() to service_role;

-- Nightly at 03:00 — plus on demand from the viewer (M9-02).
select cron.schedule(
  'confide-chain-verify',
  '0 3 * * *',
  $$select public.verify_all_audit_chains()$$
);
