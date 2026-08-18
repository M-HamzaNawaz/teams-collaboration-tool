import { getSession } from '@/lib/auth/session'
import { buildNameQueue } from '@/lib/names/queue'

import { NameReviewQueue } from './name-review-queue'

/**
 * /app/names (M4-07 admin side) — the name-change review queue.
 *
 * Admin-only: approving is the ONLY path from a member's requested string
 * to a live display_name, and the requested string has already been through
 * detect() so the reviewer sees what was caught before they click.
 */
export default async function NamesPage() {
  const session = await getSession()
  if (!session) return null

  if (session.profile.member_role !== 'admin') {
    return (
      <main className="flex h-full items-center justify-center p-6">
        <p className="text-muted">
          Name changes are reviewed by workspace admins.
        </p>
      </main>
    )
  }

  // Seed the client with the pending queue so cards paint on arrival —
  // no second client-side skeleton (the chat page's double-skeleton fix).
  const initial = await buildNameQueue(session.profile.workspace_id)

  return <NameReviewQueue initialQueue={initial ?? undefined} />
}
