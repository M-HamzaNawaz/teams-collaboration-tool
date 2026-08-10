-- Per-group moderation rules.
--
-- Until now every rule was workspace-wide. Real agencies need per-group
-- variation: an internal team channel doesn't need the same hold policy as
-- a client-facing project room. Precedence is group → workspace → default,
-- so an unset group simply inherits what it always did.
--
-- Shape (all optional; src/lib/groups/settings.ts owns the defaults):
--   { "hold_contact_info": bool,   -- false = deliver + flag instead of hold
--     "scan_filenames":    bool,
--     "allow_files":       bool,
--     "escalate_minutes":  int,
--     "auto_approve_hours":int }

alter table public.groups
  add column settings_jsonb jsonb not null default '{}'::jsonb;

-- Escalation timers now prefer the group's own values (M6-04).
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
  -- 1. Escalations: pending past the threshold, not yet escalated.
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
             mins => coalesce(
               (g.settings_jsonb #>> '{escalate_minutes}')::int,
               (w.settings_jsonb #>> '{moderation,escalate_minutes}')::int,
               30))
     for update of m skip locked
  loop
    update public.message_flags set escalated_at = now() where message_id = r.id;

    insert into public.audit_log
      (workspace_id, actor_id, actor_display_name, group_id, group_name,
       event_type, payload_jsonb)
    values
      (r.workspace_id, null, 'system', r.group_id, r.group_name,
       'message.escalated',
       jsonb_build_object('message_id', r.id, 'held_since', r.created_at));

    perform realtime.send(
      jsonb_build_object('message_id', r.id, 'group_id', r.group_id),
      'message_escalated',
      'workspace:' || r.workspace_id || ':moderation',
      false);

    v_escalated := v_escalated + 1;
  end loop;

  -- 2. Auto-approval past the hard timeout — flag intact, distinguishable.
  for r in
    select m.id, m.workspace_id, m.group_id, g.name as group_name,
           m.created_at
      from public.messages m
      join public.workspaces w on w.id = m.workspace_id
      join public.groups g on g.id = m.group_id
     where m.status = 'pending'
       and m.created_at < now() - make_interval(
             hours => coalesce(
               (g.settings_jsonb #>> '{auto_approve_hours}')::int,
               (w.settings_jsonb #>> '{moderation,auto_approve_hours}')::int,
               8))
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
