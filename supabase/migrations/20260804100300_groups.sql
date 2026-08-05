-- M1-02: groups and membership.
--
-- I3: the lifecycle is active → archived → deleted, ALL as status values.
-- No code path deletes a groups row — a deleted group is a tombstone (name,
-- dates, member history survive) so audit entries stay readable forever.

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  name text not null,
  status public.group_status not null default 'active',
  created_by uuid not null references public.users (id),
  created_at timestamptz not null default now(),
  archived_at timestamptz,
  deleted_at timestamptz
);

create index groups_workspace_idx on public.groups (workspace_id, status);

create table public.group_members (
  group_id uuid not null references public.groups (id),
  user_id uuid not null references public.users (id),
  workspace_id uuid not null references public.workspaces (id),
  group_role public.group_role not null default 'member',
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  primary key (group_id, user_id)
);

create index group_members_user_idx on public.group_members (user_id);
create index group_members_workspace_idx on public.group_members (workspace_id);

-- "At most one Manager per group" (spec §5) — enforced by the database, not
-- application code. Applies to active memberships only, so a removed
-- manager can be replaced.
create unique index one_manager_per_group
  on public.group_members (group_id)
  where group_role = 'manager' and removed_at is null;
