-- M1-04/05: messages, message_flags, files.
--
-- I1 (No DMs): group_id is NOT NULL and there is no recipient_id, no
-- conversation_id, no nullable second party. A private message is not
-- REPRESENTABLE in this schema. Any future migration adding a recipient
-- column violates the product's core premise — see docs/plans/README.md.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  group_id uuid not null references public.groups (id),
  sender_id uuid not null references public.users (id),
  body text not null,
  status public.message_status not null default 'pending',
  created_at timestamptz not null default now(),
  -- delivered_at ≠ created_at marks a held-then-approved message; the UI
  -- renders the "released after review" marker from this gap (M6-05).
  delivered_at timestamptz
);

create index messages_group_idx on public.messages (group_id, created_at desc);
create index messages_pending_idx on public.messages (workspace_id, created_at)
  where status = 'pending';

create table public.message_flags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  message_id uuid not null references public.messages (id) on delete cascade,
  findings_jsonb jsonb not null,
  action public.detection_action not null,
  resolution public.flag_resolution,
  resolved_by uuid references public.users (id),
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create index message_flags_message_idx on public.message_flags (message_id);
create index message_flags_open_idx on public.message_flags (workspace_id, created_at)
  where resolution is null;

create table public.files (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  group_id uuid not null references public.groups (id),
  message_id uuid references public.messages (id) on delete set null,
  uploader_id uuid not null references public.users (id),
  name text not null,
  mime text not null,
  size_bytes bigint not null,
  storage_path text not null,
  scan_status public.scan_status not null default 'pending',
  created_at timestamptz not null default now()
);

create index files_group_idx on public.files (group_id, created_at desc);
