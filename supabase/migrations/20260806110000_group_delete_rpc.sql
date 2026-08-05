-- M4-02: permanent group deletion as ONE transaction.
--
-- Purge + tombstone + audit must be all-or-nothing: a group half-purged with
-- no audit entry is exactly the failure mode this product exists to prevent
-- (the audit trail IS the deliverable). PostgREST cannot span statements in a
-- transaction, so the whole operation lives here, called by the API layer
-- behind authorize() (M3-06: two-step — only an ARCHIVED group may be
-- deleted, checked again here as defense in depth).
--
-- I3: this sets status = 'deleted' and NEVER deletes the group row. The
-- tombstone (name, dates, member history in group_members) is what keeps
-- years-old audit entries readable.

create or replace function public.delete_group_permanently(
  p_group_id uuid,
  p_actor_id uuid,
  p_actor_display_name text
) returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_group public.groups%rowtype;
  v_messages_purged bigint;
  v_files_purged bigint;
begin
  select * into v_group from public.groups where id = p_group_id for update;

  if not found then
    raise exception 'group % not found', p_group_id;
  end if;
  if v_group.status <> 'archived' then
    raise exception 'permanent deletion requires the group be archived first (is %)',
      v_group.status;
  end if;

  -- message_flags cascade from messages (M1-04). Storage OBJECTS are purged
  -- by the API layer before calling this (M7 — no objects exist until then);
  -- the file rows go here so the database never references purged content.
  delete from public.messages where group_id = p_group_id;
  get diagnostics v_messages_purged = row_count;

  delete from public.files where group_id = p_group_id;
  get diagnostics v_files_purged = row_count;

  update public.groups
     set status = 'deleted', deleted_at = now()
   where id = p_group_id;

  -- Audit entry in the SAME transaction — the hash-chain trigger (M1-07)
  -- fills prev_hash/row_hash. Denormalized name outlives the purge.
  insert into public.audit_log
    (workspace_id, actor_id, actor_display_name, group_id, group_name,
     event_type, payload_jsonb)
  values
    (v_group.workspace_id, p_actor_id, p_actor_display_name,
     v_group.id, v_group.name, 'group.deleted',
     jsonb_build_object(
       'messages_purged', v_messages_purged,
       'files_purged', v_files_purged,
       'archived_at', v_group.archived_at
     ));

  return jsonb_build_object(
    'messages_purged', v_messages_purged,
    'files_purged', v_files_purged
  );
end;
$$;

-- API-layer-only: the browser must go through the route (and its
-- type-to-confirm), never call this directly.
revoke execute on function public.delete_group_permanently(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.delete_group_permanently(uuid, uuid, text)
  to service_role;
