-- M6-03: who gets the email when a message is held and NOBODY is watching.
--
-- Returns the workspace admins' real emails — but ONLY when no admin has a
-- session refreshed in the last 5 minutes. An admin with the app open gets
-- the realtime toast instead; email is the fallback, not a duplicate.
-- security definer: auth.sessions and users.email are unreadable otherwise,
-- and this stays server-side (service_role execute only).

create or replace function public.admin_alert_recipients(p_workspace_id uuid)
returns table (email text)
language sql
security definer
set search_path = ''
as $$
  select u.email
    from public.profiles p
    join public.users u on u.id = p.user_id
   where p.workspace_id = p_workspace_id
     and p.member_role = 'admin'
     and not exists (
       select 1
         from public.profiles pa
         join auth.sessions s on s.user_id = pa.user_id
        where pa.workspace_id = p_workspace_id
          and pa.member_role = 'admin'
          and s.updated_at > now() - interval '5 minutes'
     );
$$;

revoke execute on function public.admin_alert_recipients(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_alert_recipients(uuid) to service_role;
