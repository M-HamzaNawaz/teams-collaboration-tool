import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * The product's whole reason for existing, as one test (M10-03):
 *
 *   invite → consent → send a message containing a phone number →
 *   sender sees "pending review" → recipient receives NOTHING →
 *   admin approves → recipient receives it → audit shows the chain
 *
 * Plus the three guards: removal cuts access mid-session, an archived
 * group rejects writes, and a cross-tenant login sees nothing.
 *
 * Runs against the seeded local stack (scripts/seed.ts identities).
 */

const ADMIN = { email: 'usman@seed-a.confide.test', password: 'seed-password-123' }
const RECIPIENT = { email: 'sarah@seed-a.confide.test', password: 'seed-password-123' }
const OUTSIDER = { email: 'bilal@seed-b.confide.test', password: 'seed-password-123' }
const SARAH_ID = '00000000-0000-4000-8000-0000000000a3'
const ARCHIVED_GROUP = '00000000-0000-4000-8000-000000000102'

async function login(page: Page, who: { email: string; password: string }) {
  await page.goto('/login')
  await page.fill('input[type=email]', who.email)
  await page.fill('input[type=password]', who.password)
  await page.click('button[type=submit]')
  await page.waitForURL('**/app', { timeout: 45_000 })
}

async function loggedInPage(browser: Browser, who: { email: string; password: string }) {
  const context = await browser.newContext()
  const page = await context.newPage()
  await login(page, who)
  return page
}

test('the full control loop: invite → consent → hold → approve → deliver → audit', async ({ browser }) => {
  const run = Date.now()
  const groupName = `E2E Loop ${run}`
  const inviteeEmail = `client-${run}@e2e.confide.test`

  // ── Admin: create a group, add the recipient, invite a brand-new client.
  const admin = await loggedInPage(browser, ADMIN)
  const groupResponse = await admin.request.post('/api/groups', {
    data: { name: groupName },
  })
  expect(groupResponse.status()).toBe(201)
  const { group } = (await groupResponse.json()) as { group: { id: string } }

  await admin.request.post(`/api/groups/${group.id}/members`, {
    data: { userId: SARAH_ID },
  })

  const inviteResponse = await admin.request.post('/api/invitations', {
    data: {
      email: inviteeEmail,
      displayName: 'E2E Client',
      role: 'client',
      groupId: group.id,
    },
  })
  expect(inviteResponse.status()).toBe(201)
  const invite = (await inviteResponse.json()) as { devInviteUrl?: string }
  expect(invite.devInviteUrl, 'dev invite url (no RESEND key locally)').toBeTruthy()

  // ── Invitee: open the link, consent, set a password, land in the app.
  const inviteeContext = await browser.newContext()
  const invitee = await inviteeContext.newPage()
  await invitee.goto(invite.devInviteUrl!)
  await expect(invitee.getByText('E2E Client')).toBeVisible()
  await invitee.fill('input[placeholder*="Choose a password"]', 'e2e-client-pass-1')
  await invitee.fill('input[placeholder="Confirm password"]', 'e2e-client-pass-1')
  await invitee.check('input[type=checkbox]')
  await invitee.click('button[type=submit]')
  await invitee.waitForURL('**/app', { timeout: 45_000 })
  await expect(invitee.getByText(groupName).first()).toBeVisible()

  // ── Recipient opens the group and stays on it.
  const recipient = await loggedInPage(browser, RECIPIENT)
  await recipient.getByRole('button', { name: new RegExp(groupName) }).click()

  // ── The client tries to hand over a phone number.
  const smuggle = `you can also call me on +92 300 5550${String(run).slice(-3)}`
  await invitee.fill('textarea', smuggle)
  await invitee.press('textarea', 'Enter')

  // Sender sees pending review — never silently gone.
  await expect(invitee.getByText('pending review').first()).toBeVisible({ timeout: 10_000 })

  // Recipient's client receives NOTHING.
  await recipient.waitForTimeout(3_000)
  await expect(recipient.locator(`text=${smuggle}`)).toHaveCount(0)

  // ── Admin approves from the moderation queue.
  // Assert the SERVER state before the UI: when this fails on CI, the log
  // then says whether the message never reached the queue (data/scoping) or
  // the page didn't render it (client) — instead of one ambiguous "element
  // not found".
  const queueResponse = await admin.request.get('/api/moderation/queue')
  expect(queueResponse.status(), 'moderation queue API').toBe(200)
  const { queue } = (await queueResponse.json()) as {
    queue: Array<{ body: string }>
  }
  expect(
    queue.map((q) => q.body),
    'the held message is in the admin queue',
  ).toContain(smuggle)

  await admin.goto('/app/moderation')
  const card = admin.locator('article', { hasText: smuggle })
  await expect(card).toBeVisible({ timeout: 30_000 })
  await card.getByRole('button', { name: /Approve/ }).click()

  // ── Delivery: the recipient receives it WITHOUT a reload.
  await expect(recipient.locator(`text=${smuggle}`).first()).toBeVisible({ timeout: 10_000 })

  // ── The audit log shows the chain. (No group filter: invite.accepted is
  // a workspace-level entry; this run's events are the newest rows.)
  await admin.goto('/app/audit')
  const auditResponse = await admin.request.get('/api/audit?limit=100')
  const { entries } = (await auditResponse.json()) as {
    entries: Array<{ event_type: string }>
  }
  const types = entries.map((e) => e.event_type)
  for (const expected of [
    'group.created',
    'member.added',
    'invite.created',
    'invite.accepted',
    'message.held',
    'message.approved',
  ]) {
    expect(types, `audit chain contains ${expected}`).toContain(expected)
  }

  // ── Removal cuts access mid-session.
  const invitedUserId = entries.length
    ? ((await (
        await admin.request.get(`/api/groups/${group.id}/profiles`)
      ).json()) as { profiles: Array<{ userId: string; displayName?: string }> })
    : { profiles: [] }
  const clientEntry = invitedUserId.profiles.find(
    (p) => p.displayName === 'E2E Client',
  )
  expect(clientEntry).toBeTruthy()
  const removal = await admin.request.delete(
    `/api/groups/${group.id}/members/${clientEntry!.userId}`,
  )
  expect(removal.status()).toBe(200)

  const afterRemoval = await invitee.request.post('/api/messages', {
    data: { groupId: group.id, body: 'am I still here?' },
  })
  expect([401, 403]).toContain(afterRemoval.status())
})

test('an archived group rejects writes — even from the admin', async ({ browser }) => {
  const admin = await loggedInPage(browser, ADMIN)
  const response = await admin.request.post('/api/messages', {
    data: { groupId: ARCHIVED_GROUP, body: 'note into the archive' },
  })
  expect(response.status()).toBe(403)
  expect(((await response.json()) as { error: string }).error).toContain('read-only')
})

test('a cross-tenant login sees nothing of workspace A', async ({ browser }) => {
  const outsider = await loggedInPage(browser, OUTSIDER)
  // Workspace B's sidebar: its own "Unipile" bait group, never A's data.
  const groupsResponse = await outsider.request.get('/api/groups')
  const { groups } = (await groupsResponse.json()) as {
    groups: Array<{ workspace_id: string }>
  }
  expect(groups.length).toBeGreaterThan(0)
  for (const g of groups) {
    expect(g.workspace_id).toBe('00000000-0000-4000-8000-0000000000bb')
  }
  // A direct probe at a workspace-A group 404s.
  const probe = await outsider.request.post(
    '/api/groups/00000000-0000-4000-8000-000000000101/archive',
  )
  expect(probe.status()).toBe(404)
})
