import 'server-only'

import { z } from 'zod'

/**
 * Server environment (M0-06).
 *
 * Parsed once at module load so a missing key fails at boot with a named error,
 * rather than surfacing as `undefined` at the first request that needs it.
 *
 * The `server-only` import above makes this module a build error if it is ever
 * reached from a client component — the service-role key bypasses RLS, so a
 * leak into the browser bundle would hand any visitor unrestricted read and
 * write access to every workspace in the database.
 */
const serverSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, 'must not be empty'),
  DATABASE_URL: z.string().min(1, 'must not be empty'),

  // Email is not wired until M4-04 (invitations); optional so local development
  // and CI can boot without a Resend account.
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),

  // Web push (Tier 2): optional so environments without the key boot fine —
  // pushes silently no-op until both VAPID halves are configured.
  VAPID_PRIVATE_KEY: z.string().optional(),

  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
})

const parsed = serverSchema.safeParse(process.env)

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')

  throw new Error(
    `Invalid server environment:\n${issues}\n` +
      `Copy .env.example to .env.local and fill in the missing values. ` +
      `Local Supabase keys are printed by \`npm run db:start\`.`,
  )
}

export const serverEnv = parsed.data

export type ServerEnv = typeof serverEnv
