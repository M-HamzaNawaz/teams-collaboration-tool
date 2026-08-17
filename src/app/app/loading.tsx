/**
 * Instant navigation feedback for every /app page: the dock and top bar
 * stay put (they live in the layout) while the incoming page streams, and
 * this skeleton fills the content area the moment a nav link is clicked —
 * the difference between "did my click work?" and "it's loading".
 *
 * Geometry matches the card pages (dashboard/moderation/audit) so there is
 * no layout jolt when the real content lands.
 */
export default function AppLoading() {
  return (
    <div className="h-full overflow-hidden">
      <div className="mx-auto w-full max-w-[1160px] p-4 md:px-10 md:py-8">
        <div className="mb-6">
          <div className="skeleton h-3 w-24" />
          <div className="skeleton mt-2 h-8 w-64" />
          <div className="skeleton mt-2 h-4 w-80" />
        </div>
        <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <div className="skeleton h-24" />
          <div className="skeleton h-24" />
          <div className="skeleton h-24" />
          <div className="skeleton h-24" />
        </div>
        <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
          <div className="skeleton h-72" />
          <div className="flex flex-col gap-4">
            <div className="skeleton h-32" />
            <div className="skeleton h-36" />
          </div>
        </div>
      </div>
    </div>
  )
}
