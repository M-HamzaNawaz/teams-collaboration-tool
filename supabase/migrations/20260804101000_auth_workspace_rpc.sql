-- M3-03: atomic workspace bootstrap + M3-02: session revocation.

-- Signup creates workspace + admin profile + default visibility rules +
-- audit entry in ONE transaction — a partial failure leaves no orphan
-- workspace and no admin-less workspace (M3-03 acceptance).
create or replace function public.create_workspace_with_admin(
  p_user_id uuid,
  p_workspace_name text,
  p_display_name text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  ws uuid;
begin
  insert into public.workspaces (name, owner_id)
  values (p_workspace_name, p_user_id)
  returning id into ws;

  insert into public.profiles (user_id, workspace_id, display_name, member_role, role_label)
  values (p_user_id, ws, p_display_name, 'admin', 'Agency Owner');

  -- Default visibility matrix (M8-01, spec §5): clients see first name +
  -- last initial + role label only (the projection layer renders from
  -- display_name); team members see each other and the client normally.
  -- Real email/phone are never fields here — they live in users, which
  -- non-admins cannot read at all.
  insert into public.role_visibility_rules
    (workspace_id, viewer_role, target_role, visible_fields)
  values
    (ws, 'client', 'admin',  '["display_name","role_label","avatar_url"]'),
    (ws, 'client', 'member', '["display_name","role_label","avatar_url"]'),
    (ws, 'client', 'client', '["display_name","avatar_url"]'),
    (ws, 'member', 'admin',  '["display_name","nickname","role_label","avatar_url"]'),
    (ws, 'member', 'member', '["display_name","nickname","role_label","avatar_url"]'),
    (ws, 'member', 'client', '["display_name","nickname","role_label","avatar_url"]'),
    (ws, 'admin',  'admin',  '["display_name","nickname","role_label","avatar_url"]'),
    (ws, 'admin',  'member', '["display_name","nickname","role_label","avatar_url"]'),
    (ws, 'admin',  'client', '["display_name","nickname","role_label","avatar_url"]');

  insert into public.audit_log
    (workspace_id, actor_id, actor_display_name, event_type, payload_jsonb)
  values
    (ws, p_user_id, p_display_name, 'workspace.created',
     jsonb_build_object('name', p_workspace_name));

  return ws;
end;
$$;

-- API-only: browser roles cannot mint workspaces directly.
revoke execute on function public.create_workspace_with_admin(uuid, text, text)
  from public, anon, authenticated;
grant execute on function public.create_workspace_with_admin(uuid, text, text)
  to service_role;

-- M3-02: revocation. supabase-js admin.signOut() needs the target's JWT,
-- which we don't have when an ADMIN removes a MEMBER — so refresh tokens are
-- revoked directly. Combined effect on removal:
--   * RLS denies on the next query (removed_at set) — instant data cutoff
--   * this function kills refresh — the 10-minute JWT cannot be renewed
create or replace function public.revoke_user_refresh_tokens(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update auth.refresh_tokens set revoked = true where user_id = p_user_id::text;
end;
$$;

revoke execute on function public.revoke_user_refresh_tokens(uuid)
  from public, anon, authenticated;
grant execute on function public.revoke_user_refresh_tokens(uuid)
  to service_role;
