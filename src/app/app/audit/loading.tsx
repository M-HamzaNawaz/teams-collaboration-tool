/** Audit transition skeleton — banner, filter row, and the event list. */
export default function AuditLoading() {
  return (
    <div className="mx-auto h-full w-full max-w-235 overflow-hidden p-4 md:px-10 md:py-8">
      <div className="mb-6">
        <div className="skeleton h-3 w-16" />
        <div className="skeleton mt-2 h-8 w-56" />
        <div className="skeleton mt-2 h-4 w-96" />
      </div>
      <div className="skeleton mb-4 h-16" />
      <div className="mb-4 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1.4fr_1fr]">
        <div className="skeleton h-10" />
        <div className="skeleton h-10" />
        <div className="skeleton h-10" />
      </div>
      <div className="flex flex-col gap-1 rounded-xl border border-border bg-surface p-1.5">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="skeleton h-12" />
        ))}
      </div>
    </div>
  )
}
