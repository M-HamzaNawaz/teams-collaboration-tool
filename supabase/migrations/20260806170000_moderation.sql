-- M6: moderation — atomic resolution + the escalation valve.

create extension if not exists pg_cron;

-- When a held message was escalated to the group manager (M6-04).
alter table public.message_flags
  add column escalated_at timestamptz;

-- ── M6-02: approve/block as ONE transaction ─────────────────────────────
-- Approval IS delivery: status → 'delivered' passes the member RLS policy
-- and Realtime fans the UPDATE out (M5-02). delivered_at is set HERE, at
-- approval time — the released-after-review marker (M6-05) reads the gap.
create or replace function public.resolve_message(
  p_message_id uuid,
  p_decision text, -- 'approved' | 'blocked'
  p_actor_id uuid,
  p_actor_display_name text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message public.messages%rowtype;
  v_group public.groups%rowtype;
begin
  if p_decision not in ('approved', 'blocked') then
    raise exception 'decision must be approved or blocked';
  end if;

  select * into v_message from public.messages
   where id = p_message_id for update;
  if not found or v_message.status <> 'pending' then
    -- Already resolved (or never held): a double-click must not re-deliver.
    raise exception 'message is not pending review' using errcode = 'P0010';
  end if;

  update public.messages
     set status = case p_decision when 'approved' then 'delivered'
                                  else 'blocked' end::public.message_status,
         delivered_at = case when p_decision = 'approved' then now() end
   where id = p_message_id;

  update public.message_flags
     set resolution = p_decision::public.flag_resolution,
         resolved_by = p_actor_id,
         resolved_at = now()
   where message_id = p_message_id;

  select * into v_group from public.groups where id = v_message.group_id;

  insert into public.audit_log
    (workspace_id, actor_id, actor_display_name, group_id, group_name,
     event_type, payload_jsonb)
  values
    (v_message.workspace_id, p_actor_id, p_actor_display_name,
     v_message.group_id, coalesce(v_group.name, ''),
     'message.' || p_decision,
     jsonb_build_object('message_id', p_message_id,
                        'sender_id', v_message.sender_id,
                        'held_for_seconds',
                        extract(epoch from now() - v_message.created_at)::bigint));

  return jsonb_build_object('id', p_message_id, 'decision', p_decision);
end;
$$;

revoke execute on function public.resolve_message(uuid, text, uuid, text)
  from public, anon, authenticated;
grant execute on function public.resolve_message(uuid, text, uuid, text)
  to service_role;

-- ── M6-04: the escalation valve, run by pg_cron every minute ────────────
-- "Held indefinitely with nobody watching" is the outcome that kills
-- adoption (TECHNICAL_PLAN §6.3). Two timers, per-workspace configurable
-- via settings_jsonb.moderation:
--   escalate_minutes   (default 30) → nudge the group manager, once
--   auto_approve_hours (default 8)  → deliver WITH the flag intact —
--     auto_approved is its own resolution, distinguishable everywhere.
create or replace function public.escalate_held_messages()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_escalated int := 0;
  v_auto int := 0;
  r record;
begin
  -- 1. Escalations: pending past the workspace threshold, not yet escalated.
  for r in
    select m.id, m.workspace_id, m.group_id, g.name as group_name,
           m.created_at
      from public.messages m
      join public.workspaces w on w.id = m.workspace_id
      join public.groups g on g.id = m.group_id
      join public.message_flags f on f.message_id = m.id
     where m.status = 'pending'
       and f.escalated_at is null
       and m.created_at < now() - make_interval(
             mins => coalesce((w.settings_jsonb #>> '{moderation,escalate_minutes}')::int, 30))
     for update of m skip locked
  loop
    update public.message_flags set escalated_at = now() where message_id = r.id;

    insert into public.audit_log
      (workspace_id, actor_id, actor_display_name, group_id, group_name,
       event_type, payload_jsonb)
    values
      (r.workspace_id, null, 'system', r.group_id, r.group_name,
       'message.escalated',
       jsonb_build_object('message_id', r.id,
                          'held_since', r.created_at));

    -- Nudge open moderation dashboards (workspace topic, M6-03 subscribes).
    perform realtime.send(
      jsonb_build_object('message_id', r.id, 'group_id', r.group_id),
      'message_escalated',
      'workspace:' || r.workspace_id || ':moderation',
      false);

    v_escalated := v_escalated + 1;
  end loop;

  -- 2. Auto-approval: pending past the hard timeout. The UPDATE to
  -- 'delivered' fans out over Realtime by itself; the flag row keeps its
  -- findings and gains resolution='auto_approved' — nothing escapes the
  -- record, and the admin UI can tell a human approval from the timer.
  for r in
    select m.id, m.workspace_id, m.group_id, g.name as group_name,
           m.created_at
      from public.messages m
      join public.workspaces w on w.id = m.workspace_id
      join public.groups g on g.id = m.group_id
     where m.status = 'pending'
       and m.created_at < now() - make_interval(
             hours => coalesce((w.settings_jsonb #>> '{moderation,auto_approve_hours}')::int, 8))
     for update of m skip locked
  loop
    update public.messages
       set status = 'delivered', delivered_at = now()
     where id = r.id;

    update public.message_flags
       set resolution = 'auto_approved', resolved_at = now()
     where message_id = r.id;

    insert into public.audit_log
      (workspace_id, actor_id, actor_display_name, group_id, group_name,
       event_type, payload_jsonb)
    values
      (r.workspace_id, null, 'system', r.group_id, r.group_name,
       'message.auto_approved',
       jsonb_build_object('message_id', r.id,
                          'held_for_seconds',
                          extract(epoch from now() - r.created_at)::bigint));

    v_auto := v_auto + 1;
  end loop;

  return jsonb_build_object('escalated', v_escalated, 'auto_approved', v_auto);
end;
$$;

revoke execute on function public.escalate_held_messages()
  from public, anon, authenticated;
grant execute on function public.escalate_held_messages() to service_role;

-- Every minute. cron.schedule upserts by job name, so re-running this
-- migration (db reset) does not stack duplicate jobs.
select cron.schedule(
  'confide-escalations',
  '* * * * *',
  $$select public.escalate_held_messages()$$
);
