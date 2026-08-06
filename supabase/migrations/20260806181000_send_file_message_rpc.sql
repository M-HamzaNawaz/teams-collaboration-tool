-- M7-02: a file upload is a MESSAGE with an attachment — one transaction.
--
-- Composes send_message() (M5-01): the message body is the filename, the
-- detection verdict came from detect(filename) in the API layer, and a
-- flagged filename holds the message exactly like flagged text. The files
-- row rides in the same transaction, so no message ever references a file
-- row that failed to write (the storage OBJECT is uploaded before this is
-- called and removed by the route if this raises).

create or replace function public.send_file_message(
  p_workspace_id uuid,
  p_group_id uuid,
  p_sender_id uuid,
  p_sender_display_name text,
  p_group_name text,
  p_filename text,
  p_action public.detection_action,
  p_findings jsonb,
  p_mime text,
  p_size_bytes bigint,
  p_storage_path text,
  p_scan_status public.scan_status
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_message jsonb;
  v_file_id uuid;
begin
  v_message := public.send_message(
    p_workspace_id, p_group_id, p_sender_id, p_sender_display_name,
    p_group_name, p_filename, p_action, p_findings);

  insert into public.files
    (workspace_id, group_id, message_id, uploader_id, name, mime,
     size_bytes, storage_path, scan_status)
  values
    (p_workspace_id, p_group_id, (v_message ->> 'id')::uuid, p_sender_id,
     p_filename, p_mime, p_size_bytes, p_storage_path, p_scan_status)
  returning id into v_file_id;

  insert into public.audit_log
    (workspace_id, actor_id, actor_display_name, group_id, group_name,
     event_type, payload_jsonb)
  values
    (p_workspace_id, p_sender_id, p_sender_display_name, p_group_id,
     p_group_name, 'file.uploaded',
     jsonb_build_object('file_id', v_file_id,
                        'message_id', v_message ->> 'id',
                        'name', p_filename,
                        'size_bytes', p_size_bytes,
                        'scan_status', p_scan_status,
                        'detection_action', p_action));

  return v_message || jsonb_build_object('file_id', v_file_id);
end;
$$;

revoke execute on function public.send_file_message(
  uuid, uuid, uuid, text, text, text, public.detection_action, jsonb,
  text, bigint, text, public.scan_status)
  from public, anon, authenticated;
grant execute on function public.send_file_message(
  uuid, uuid, uuid, text, text, text, public.detection_action, jsonb,
  text, bigint, text, public.scan_status)
  to service_role;
