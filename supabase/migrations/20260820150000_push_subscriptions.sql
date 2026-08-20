-- Web push (Tier 2): one row per browser push subscription. Written and
-- read ONLY by the API with the service role — RLS is enabled with no
-- policies, so the browser role can't touch endpoints (each one is a
-- capability URL that lets its holder send that browser notifications).

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (workspace_id, user_id);

alter table public.push_subscriptions enable row level security;
