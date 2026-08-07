-- A CLIENT can never be a group MANAGER — enforced by the database.
--
-- Found by real usage: a client promoted to manager sees the moderation
-- queue, where held messages appear WITH their detection findings — i.e.
-- the exact contact information the hold exists to keep away from that
-- client. The manager role is a team-side elevation (spec Q5); this trigger
-- encodes the "team-side" part the schema previously left implicit.

create or replace function public.forbid_client_managers()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.group_role = 'manager' and exists (
    select 1 from public.profiles p
     where p.user_id = new.user_id
       and p.workspace_id = new.workspace_id
       and p.member_role = 'client'
  ) then
    raise exception 'clients cannot be group managers'
      using errcode = 'P0020';
  end if;
  return new;
end;
$$;

create trigger group_members_no_client_manager
  before insert or update on public.group_members
  for each row execute function public.forbid_client_managers();

-- Repair any existing client-managers (the dev database has one: a client
-- was promoted during manual testing). Demote to plain member.
update public.group_members gm
   set group_role = 'member'
  from public.profiles p
 where p.user_id = gm.user_id
   and p.workspace_id = gm.workspace_id
   and p.member_role = 'client'
   and gm.group_role = 'manager';
