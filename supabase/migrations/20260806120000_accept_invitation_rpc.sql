-- M4-05/06: invitation acceptance as ONE transaction.
--
-- Profile + optional group membership + consent record + token burn + audit
-- are all-or-nothing: there is no state where someone entered the workspace
-- without a consent row, and no state where a token was burned but nothing
-- happened. The auth account itself is created BEFORE this call (GoTrue owns
-- password hashing); if this raises, that account simply has no workspace —
-- the same harmless dangle as a failed signup (M3-03).
--
-- I2: display_name / nickname / role_label are copied from the INVITATION
-- row — the values the admin fixed at invite time. The invitee's input never
-- reaches this function.

create or replace function public.accept_invitation(
  p_token_hash text,
  p_user_id uuid,
  p_doc_version text,
  p_ip inet,
  p_user_agent text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  inv public.invitations%rowtype;
  v_group public.groups%rowtype;
  v_display_name text;
begin
  select * into inv
    from public.invitations
   where token_hash = p_token_hash
     for update;

  if not found or inv.accepted_at is not null or inv.expires_at <= now() then
    -- One message for unknown, used, and expired: the token is the secret,
    -- and a probe must not learn which failure it hit.
    raise exception 'invitation is invalid or has expired'
      using errcode = 'P0004';
  end if;

  -- The invited human, not whoever holds the link with a different account.
  if not exists (
    select 1 from public.users
     where id = p_user_id and lower(email) = lower(inv.email)
  ) then
    raise exception 'invitation was issued to a different email'
      using errcode = 'P0005';
  end if;

  if exists (
    select 1 from public.profiles
     where user_id = p_user_id and workspace_id = inv.workspace_id
  ) then
    raise exception 'already a member of this workspace'
      using errcode = 'P0006';
  end if;

  insert into public.profiles
    (user_id, workspace_id, display_name, nickname, member_role, role_label,
     avatar_status)
  values
    (p_user_id, inv.workspace_id, inv.display_name, inv.nickname,
     inv.member_role, inv.role_label, 'none');  -- initials-only, decision #2

  v_display_name := inv.display_name;

  -- Group-targeted invite: join (or re-activate) as a plain group member.
  if inv.group_id is not null then
    select * into v_group from public.groups where id = inv.group_id;
    if found and v_group.status = 'active' then
      insert into public.group_members
        (group_id, user_id, workspace_id, group_role)
      values (inv.group_id, p_user_id, inv.workspace_id, 'member')
      on conflict (group_id, user_id)
        do update set removed_at = null, joined_at = now();

      insert into public.audit_log
        (workspace_id, actor_id, actor_display_name, group_id, group_name,
         event_type, payload_jsonb)
      values
        (inv.workspace_id, p_user_id, v_display_name, v_group.id, v_group.name,
         'member.added', jsonb_build_object(
           'user_id', p_user_id, 'group_role', 'member', 'via', 'invitation'));
    end if;
  end if;

  -- M4-06: the consent record — who accepted which document version, when,
  -- from where. The evidentiary half of the non-circumvention agreement.
  insert into public.consents
    (user_id, workspace_id, doc_type, doc_version, ip, user_agent)
  values
    (p_user_id, inv.workspace_id, 'nca', p_doc_version, p_ip, p_user_agent);

  update public.invitations
     set accepted_at = now()
   where id = inv.id;

  insert into public.audit_log
    (workspace_id, actor_id, actor_display_name, event_type, payload_jsonb)
  values
    (inv.workspace_id, p_user_id, v_display_name, 'invite.accepted',
     jsonb_build_object('invitation_id', inv.id, 'email', inv.email,
                        'member_role', inv.member_role)),
    (inv.workspace_id, p_user_id, v_display_name, 'consent.recorded',
     jsonb_build_object('doc_type', 'nca', 'doc_version', p_doc_version));

  return inv.workspace_id;
end;
$$;

-- API-only, like every mutation path.
revoke execute on function public.accept_invitation(text, uuid, text, inet, text)
  from public, anon, authenticated;
grant execute on function public.accept_invitation(text, uuid, text, inet, text)
  to service_role;
