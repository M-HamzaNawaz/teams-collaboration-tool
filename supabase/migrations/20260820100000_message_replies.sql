-- Message replies (WhatsApp-style): a message may point at the one it
-- answers. The QUOTED CONTENT is never copied — clients render the quote
-- from the original row, so RLS keeps governing who sees what. The API
-- refuses replies to anything not delivered in the same group, so a held
-- message can never be surfaced by quoting it.

alter table public.messages
  add column if not exists reply_to_id uuid references public.messages(id)
    on delete set null;

create index if not exists messages_reply_to_idx
  on public.messages (reply_to_id)
  where reply_to_id is not null;

-- send_message grows an optional p_reply_to. Same single transaction; the
-- old 8-arg signature is dropped so exactly one definition exists.

drop function if exists public.send_message(
  uuid, uuid, uuid, text, text, text, public.detection_action, jsonb);

create or replace function public.send_message(
  p_workspace_id uuid,
  p_group_id uuid,
  p_sender_id uuid,
  p_sender_display_name text,
  p_group_name text,
  p_body text,
  p_action public.detection_action,
  p_findings jsonb,
  p_reply_to uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status public.message_status;
  v_message public.messages%rowtype;
begin
  v_status := case p_action when 'hold' then 'pending' else 'delivered' end;

  insert into public.messages
    (workspace_id, group_id, sender_id, body, status, delivered_at,
     reply_to_id)
  values
    (p_workspace_id, p_group_id, p_sender_id, p_body, v_status,
     case when v_status = 'delivered' then now() end,
     p_reply_to)
  returning * into v_message;

  if p_action <> 'allow' then
    insert into public.message_flags
      (workspace_id, message_id, findings_jsonb, action)
    values
      (p_workspace_id, v_message.id, p_findings, p_action);
  end if;

  insert into public.audit_log
    (workspace_id, actor_id, actor_display_name, group_id, group_name,
     event_type, payload_jsonb)
  values
    (p_workspace_id, p_sender_id, p_sender_display_name, p_group_id,
     p_group_name,
     case p_action
       when 'hold' then 'message.held'
       when 'flag_only' then 'message.flagged'
       else 'message.sent'
     end,
     jsonb_build_object(
       'message_id', v_message.id,
       'detection_action', p_action,
       'findings_count', coalesce(jsonb_array_length(p_findings), 0),
       'reply_to', p_reply_to
     ));

  return jsonb_build_object(
    'id', v_message.id,
    'status', v_message.status,
    'created_at', v_message.created_at,
    'delivered_at', v_message.delivered_at
  );
end;
$$;

revoke execute on function
  public.send_message(uuid, uuid, uuid, text, text, text,
    public.detection_action, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function
  public.send_message(uuid, uuid, uuid, text, text, text,
    public.detection_action, jsonb, uuid)
  to service_role;
