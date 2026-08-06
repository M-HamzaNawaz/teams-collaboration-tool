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
  timeout: 60_000,
  fullyParallel: false, // the journey mutates shared state deliberately
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    channel: 'chrome',
    screenshot: 'only-on-failure',
  },
})
