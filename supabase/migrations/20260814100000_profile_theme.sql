-- Per-user color theme (Slack-style). Personal preference, per workspace —
-- like Slack, where each workspace can wear a different theme. NULL means
-- "not chosen yet", which the app reads as: show the first-login picker.
alter table public.profiles
  add column if not exists theme text;

comment on column public.profiles.theme is
  'Chosen color theme id (see src/lib/theme/themes.ts). NULL = never picked; app shows the onboarding picker.';
