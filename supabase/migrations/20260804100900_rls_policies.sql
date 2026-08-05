-- M1-10: Row Level Security.
--
-- RLS is enabled on EVERY table — including tables authenticated cannot read
-- at all (deny-by-default if a future grant slips through). Policies exist
-- only for the member-readable tables; there are no INSERT/UPDATE/DELETE
-- policies anywhere because browser roles hold no write grants (M1-08).

alter table public.workspaces enable row level security;
alter table public.users enable row level security;
alter table public.profiles enable row level security;
alter table public.role_visibility_rules enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_flags enable row level security;
alter table public.files enable row level security;
alter table public.invitations enable row level security;
alter table public.consents enable row level security;
alter table public.name_change_requests enable row level security;
alter table public.audit_log enable row level security;

-- Members see their own workspaces.
create policy workspaces_select on public.workspaces
  for select to authenticated
  using (app.is_workspace_member(id));

-- Profiles: self, admin, or someone you share an active group with. This is
-- the "no member directory" rule — a client can enumerate exactly the people
-- in their own groups and nobody else. Field-level masking happens in the
-- projection layer (M8); this policy controls row existence.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    user_id = (select auth.uid())
    or app.is_workspace_admin(workspace_id)
    or app.shares_active_group(user_id)
  );

-- Groups: members see their own ACTIVE groups; admins see every state.
-- Archived groups vanishing from member view IS this policy (I3).
create policy groups_select on public.groups
  for select to authenticated
  using (
    app.is_workspace_admin(workspace_id)
    or (status = 'active' and app.is_active_group_member(id))
  );

create policy group_members_select on public.group_members
  for select to authenticated
  using (
    app.is_workspace_admin(workspace_id)
    or app.is_active_group_member(group_id)
  );

-- Messages — the policy the product stands on:
--   * members read DELIVERED messages in their active groups; a held message
--     reaches no recipient, and admin approval is just status→'delivered'
--     (Realtime then fans it out, M5-02/M6-02);
--   * senders additionally see their OWN pending/blocked rows — "pending
--     review" must never silently disappear (spec §6);
--   * admins see everything in the workspace, hold queue included.
create policy messages_select on public.messages
  for select to authenticated
  using (
    (status = 'delivered' and app.is_active_group_member(group_id))
    or (sender_id = (select auth.uid()) and app.is_active_group_member(group_id))
    or app.is_workspace_admin(workspace_id)
  );

create policy files_select on public.files
  for select to authenticated
  using (
    app.is_active_group_member(group_id)
    or app.is_workspace_admin(workspace_id)
  );
