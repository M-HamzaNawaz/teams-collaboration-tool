/** Chat transition skeleton — mirrors the sidebar + thread card layout. */
export default function ChatLoading() {
  return (
    <div className="h-full w-full overflow-hidden">
      <div className="flex h-full w-full gap-3 p-2 sm:p-3">
        {/* Sidebar card */}
        <div className="hidden w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-surface md:flex">
          <div className="border-b border-border p-4">
            <div className="skeleton h-5 w-32" />
            <div className="skeleton mt-2 h-3 w-24" />
          </div>
          <div className="flex flex-col gap-2 p-3">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="skeleton h-[34px] w-[34px] rounded-lg" />
                <div className="min-w-0 flex-1">
                  <div className="skeleton h-3.5 w-3/4" />
                  <div className="skeleton mt-1.5 h-2.5 w-1/3" />
                </div>
              </div>
            ))}
          </div>
        </div>
        {/* Thread card */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex items-center gap-3 border-b border-border p-3">
            <div className="skeleton h-9 w-9 rounded-lg" />
            <div className="min-w-0 flex-1">
              <div className="skeleton h-4 w-48" />
              <div className="skeleton mt-1.5 h-3 w-64" />
            </div>
          </div>
          {/* Bubbles start at the TOP — exactly where the real message list
              renders — so content lands without a vertical jump. */}
          <div className="flex flex-1 flex-col gap-3 overflow-hidden bg-background p-4 pt-6">
            <div className="skeleton h-12 w-2/5" />
            <div className="skeleton ml-auto h-12 w-1/3" />
            <div className="skeleton h-12 w-1/2" />
            <div className="skeleton ml-auto h-12 w-2/5" />
            <div className="skeleton h-12 w-1/3" />
          </div>
          <div className="border-t border-border p-3">
            <div className="skeleton h-20 w-full rounded-[10px]" />
          </div>
        </div>
      </div>
    </div>
  )
}
