-- M1-09: RLS helper functions.
--
-- SECURITY DEFINER so they can consult profiles/group_members without
-- recursing through those tables' own policies. STABLE + indexed lookups —
-- these run on every policy evaluation, including per-change on the Realtime
-- fan-out path (M5-02). search_path pinned empty; all references qualified.

create or replace function app.is_workspace_member(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.workspace_id = ws
      and p.user_id = (select auth.uid())
  );
$$;

create or replace function app.is_workspace_admin(ws uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.workspace_id = ws
      and p.user_id = (select auth.uid())
      and p.member_role = 'admin'
  );
$$;

-- Active membership in an ACTIVE group: the single predicate that both hides
-- archived groups from members (I3) and cuts a removed member's access on
-- their very next query (M3-02's real mechanism).
create or replace function app.is_active_group_member(gid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members gm
    join public.groups g on g.id = gm.group_id
    where gm.group_id = gid
      and gm.user_id = (select auth.uid())
      and gm.removed_at is null
      and g.status = 'active'
  );
$$;

-- Do the caller and the target share at least one active group? Drives the
-- profiles policy: no shared group, no profile — there is no member
-- directory for non-admins (spec §5).
create or replace function app.shares_active_group(target_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    join public.groups g on g.id = mine.group_id
    where mine.user_id = (select auth.uid())
      and theirs.user_id = target_user
      and mine.removed_at is null
      and theirs.removed_at is null
      and g.status = 'active'
  );
$$;
