/**
 * Chat transition skeleton — sidebar shape only.
 *
 * loading.tsx renders before the server decides anything, so it cannot
 * know whether the URL carries a ?g= deep link. Since plain /app/chat now
 * opens the pick-a-conversation pane (no auto-opened group), a skeleton
 * sketching fake bubbles + composer would promise a thread that often
 * never arrives. The right side stays a quiet empty card: truthful for
 * the picker, and a deep-linked conversation paints straight over it
 * (its messages are server-seeded, so there is no second wait).
 */
export default function ChatLoading() {
  return (
    <div className="h-full w-full overflow-hidden">
      <div className="flex h-full w-full gap-3 p-2 sm:p-3">
        {/* Sidebar card */}
        <div className="flex w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-surface md:w-72">
          <div className="border-b border-border p-4">
            <div className="skeleton h-5 w-32" />
            <div className="skeleton mt-2 h-3 w-24" />
          </div>
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton h-8.5 w-8.5 rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="skeleton h-3.5 w-3/4" />
                  <div className="skeleton mt-1.5 h-2.5 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Pane: a quiet surface — the picker or a seeded conversation
            replaces it without ever contradicting it. */}
        <div className="hidden min-w-0 flex-1 rounded-xl border border-border bg-surface md:block" />
      </div>
    </div>
  )
}
