# M8 — Identity Masking

The signature feature. The rule that makes it real: masked data never leaves the server, so there is no path where the browser receives a field it merely declines to render.

**Estimate:** 4 days · **Depends on:** M4

---

### M8-01 — Visibility rules and defaults · `done` · 4 h

`role_visibility_rules(workspace_id, viewer_role, target_role, visible_fields jsonb)`, seeded at workspace creation (M3-03).

Defaults per spec: clients see a team member's first name + last initial + role label; team members see the client's name + company. Email, phone, and external links are visible to nobody but the admin, in any configuration.

**Acceptance:** rules are per-workspace; no configuration can expose `users.email` to a non-admin.

---

### M8-02 — `projectProfile()` · `done` · 5 h

```ts
function projectProfile(viewer: Member, target: Profile): MaskedProfile
```

One function, one test file. Every profile-returning endpoint passes through it.

**Acceptance:** exhaustive tests over viewer role × target role × field; `users` is unreadable by `authenticated` at the grant level anyway (M1-08), so this is the second of two locks, not the only one.

**Depends on:** M8-01

---

### M8-03 — Enforce projection at every boundary · `done` · 4 h

Audit every endpoint that returns profile data — message sender info, group member lists, mention pickers, the hold queue, the audit viewer — and route each through `projectProfile()`. A test asserts no route returns a raw profile row.

The realistic leak is not the profile page; it is a sender object attached to a message payload.

**Acceptance:** a client opening a developer's profile, or inspecting any network response containing that developer, sees no email, phone, last name, or external link.

**Depends on:** M8-02

---

### M8-04 — Visibility rules editor · `todo` · 4 h — **cuttable**

Admin UI for the per-role matrix.

On the cut list (TECHNICAL_PLAN §9.1) — the defaults are correct for the pilot and the rules can be edited directly in the database until Phase 2.

**Depends on:** M8-01
