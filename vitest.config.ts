import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Two projects, deliberately separated (M0-04):
 *
 *   unit — pure, fast, no Docker. The detection engine (M2) lives here and must
 *          stay runnable without a database, because it is a pure module and
 *          that purity is what lets it run thousands of corpus fixtures in CI.
 *
 *   db   — integration tests against the local Supabase stack. Tenant isolation
 *          (M1-12) and the invariant suite (M1-13) live here; they need real
 *          Postgres because what they assert is enforced by grants and RLS,
 *          not by application code.
 */
export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    projects: [
      {
        resolve: { alias: { '@': path.resolve(__dirname, './src') } },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
          exclude: ['**/node_modules/**', '**/*.db.test.ts'],
        },
      },
      {
        resolve: { alias: { '@': path.resolve(__dirname, './src') } },
        test: {
          name: 'db',
          environment: 'node',
          include: ['tests/db/**/*.db.test.ts'],
          setupFiles: ['tests/db/setup.ts'],
          // Isolation tests share one database; parallel writes would race.
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
        },
      },
    ],
  },
})
