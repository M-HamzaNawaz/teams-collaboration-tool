import { defineConfig } from '@playwright/test'

/**
 * E2E config (M10-03). Runs against a dev server + local Supabase stack,
 * with the system Chrome (no browser download needed locally or in CI).
 *
 *   BASE_URL=http://localhost:3001 npx playwright test   # local (3000 taken)
 *   npx playwright test                                  # CI (3000)
 */
export default defineConfig({
  testDir: './e2e',
  // CI runners compile Next routes on first hit at a fraction of laptop
  // speed — generous ceilings so timing never masquerades as a failure.
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false, // the journey mutates shared state deliberately
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    channel: 'chrome',
    navigationTimeout: 45_000,
    actionTimeout: 20_000,
    screenshot: 'only-on-failure',
    trace: process.env.CI ? 'retain-on-failure' : 'off',
  },
})
