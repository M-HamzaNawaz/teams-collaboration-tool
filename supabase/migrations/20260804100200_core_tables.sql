-- M1-01: workspaces, users, profiles, role_visibility_rules.

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null,
  settings_jsonb jsonb not null default '{}',
  created_at timestamptz not null default now()
);

-- Real contact data. NO select grant for authenticated (M1-08): a member's
-- email/phone is reachable only through admin API routes. The masking
-- projection (M8) never has to "hide" what the client never receives.
create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  phone text,
  created_at timestamptz not null default now()
);

-- Mirror auth.users into public.users so FKs and admin queries have a stable
-- home for real contact data.
create or replace function public.handle_auth_user_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.users (id, email, phone)
  values (new.id, coalesce(new.email, ''), new.phone)
  on conflict (id) do update
    set email = excluded.email,
        phone = excluded.phone;
  return new;
end;
$$;

create trigger on_auth_user_change
  after insert or update on auth.users
  for each row execute function public.handle_auth_user_change();

-- One identity PER WORKSPACE: the same person can be a client at two agencies
-- with different masked identities and zero crossover.
-- I2: display_name/nickname/avatar are ADMIN-controlled — authenticated has
-- no UPDATE grant on this table (M1-08).
create table public.profiles (
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id),
  display_name text not null,
  nickname text,
  member_role public.member_role not null default 'member',
  role_label text not null default '',
  avatar_url text,
  avatar_status public.avatar_status not null default 'none',
  created_at timestamptz not null default now(),
  primary key (user_id, workspace_id)
);

create index profiles_workspace_idx on public.profiles (workspace_id);

-- Per-role visibility matrix (M8-01): which profile fields viewer_role sees
-- of target_role. Real email/phone are NOT fields here — they live in users,
-- which non-admins cannot read at all.
create table public.role_visibility_rules (
  workspace_id uuid not null references public.workspaces (id),
  viewer_role public.member_role not null,
  target_role public.member_role not null,
  visible_fields jsonb not null default '[]',
  primary key (workspace_id, viewer_role, target_role)
);
