/**
 * GET /api/version — the deployment marker the auto-refresh polls.
 * Vercel bakes the commit SHA into each deployment, so the value changes
 * exactly when a new deploy goes live. 'dev' locally (never changes —
 * auto-refresh stays dormant in development).
 */
export function GET() {
  return Response.json(
    {
      version:
        process.env.VERCEL_GIT_COMMIT_SHA ??
        process.env.VERCEL_DEPLOYMENT_ID ??
        'dev',
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
