-- M5-01: the message write — one transaction.
--
-- Message row + flag row + audit entry are all-or-nothing: there is no state
-- where a message exists without its detection record, and no state where a
-- held message wasn't audited. detect() itself runs in the API layer (the
-- pure TS module, M2) — this function receives its VERDICT and never second-
-- guesses it. The browser cannot call this (or insert messages at all,
-- M1-08): the write path is API → detect() → here, with no side door.
--
--   allow     → status 'delivered', delivered_at now
--   flag_only → 'delivered' + message_flags row (admin sees it, sender flows)
--   hold      → 'pending'   + message_flags row (recipients see NOTHING until
--               an admin approves — approval is just status→'delivered', M6)

create or replace function public.send_message(
  p_workspace_id uuid,
  p_group_id uuid,
  p_sender_id uuid,
  p_sender_display_name text,
  p_group_name text,
  p_body text,
  p_action public.detection_action,
  p_findings jsonb
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
    (workspace_id, group_id, sender_id, body, status, delivered_at)
  values
    (p_workspace_id, p_group_id, p_sender_id, p_body, v_status,
     case when v_status = 'delivered' then now() end)
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
       'findings_count', coalesce(jsonb_array_length(p_findings), 0)
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
  public.send_message(uuid, uuid, uuid, text, text, text, public.detection_action, jsonb)
  from public, anon, authenticated;
grant execute on function
  public.send_message(uuid, uuid, uuid, text, text, text, public.detection_action, jsonb)
  to service_role;
