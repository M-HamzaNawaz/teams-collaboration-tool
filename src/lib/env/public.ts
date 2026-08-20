import { z } from 'zod'

/**
 * Public environment (M0-06).
 *
 * Everything here is inlined into the client bundle at build time. Nothing
 * secret may be added to this schema — the service-role key in particular
 * belongs in `./server.ts`, which is guarded by `server-only`.
 *
 * Values are referenced as literal `process.env.NEXT_PUBLIC_*` property
 * accesses rather than through a loop, because Next.js performs a static
 * find-and-replace at build time and a dynamic lookup would resolve to
 * `undefined` in the browser.
 */
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url({ error: 'must be a valid URL' }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, 'must not be empty'),
  NEXT_PUBLIC_APP_URL: z.url({ error: 'must be a valid URL' }),
  // Web push: optional — the subscribe UI simply stays dormant without it.
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
})

const parsed = publicSchema.safeParse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
})

if (!parsed.success) {
  throw new Error(
    `Invalid public environment:\n${formatIssues(parsed.error)}\n` +
      `Copy .env.example to .env.local and fill in the missing values.`,
  )
}

export const publicEnv = parsed.data

export type PublicEnv = typeof publicEnv

function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join('.') || '(root)'}: ${issue.message}`)
    .join('\n')
}
