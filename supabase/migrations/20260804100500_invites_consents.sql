-- M1-03/05: invitations, consents, name change requests.

-- I2: display_name/role are set HERE, by the admin, at invite time. The
-- invitee never gets a field to change them.
-- token_hash = sha256(raw token); the raw token exists only in the email.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  group_id uuid references public.groups (id),
  email text not null,
  display_name text not null,
  nickname text,
  member_role public.member_role not null default 'member',
  role_label text not null default '',
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by uuid not null references public.users (id),
  created_at timestamptz not null default now()
);

create index invitations_workspace_idx on public.invitations (workspace_id);

-- The timestamped consent record (spec §8): who accepted which document
-- version, when, from where. This row is the platform's half of making the
-- non-circumvention agreement enforceable.
create table public.consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id),
  doc_type public.consent_doc_type not null,
  doc_version text not null,
  accepted_at timestamptz not null default now(),
  ip inet,
  user_agent text,
  unique (user_id, workspace_id, doc_type, doc_version)
);

-- M4-07: members REQUEST a name change; the requested string is scanned by
-- detect() before an admin sees it (findings_jsonb holds the result) — the
-- request form must not be an unscanned channel into a client-visible field.
create table public.name_change_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id),
  user_id uuid not null references public.users (id) on delete cascade,
  requested_name text not null,
  findings_jsonb jsonb not null default '[]',
  status public.request_status not null default 'pending',
  reviewed_by uuid references public.users (id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create index name_change_requests_workspace_idx
  on public.name_change_requests (workspace_id, status);
