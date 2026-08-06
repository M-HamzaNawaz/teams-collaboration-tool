-- M8-03: masked data never leaves the server — enforced by grant.
--
-- RLS controls which profile ROWS a member could see, but not which FIELDS,
-- and the masking matrix is field-level (a client must not receive a
-- nickname it merely declines to render). So the browser's roles lose
-- SELECT on profiles entirely; every profile read now flows through the API
-- and projectProfile() (M8-02):
--
--   own identity     → getSession() (service client, after JWT validation)
--   group members    → GET /api/groups/:id/profiles (masked per rules)
--   moderation queue → service-side, moderator surface (M6-01)
--
-- Same pattern as users (M1-08): absence of a grant, not presence of a
-- filter, is the guarantee.

revoke select on public.profiles from anon, authenticated;
