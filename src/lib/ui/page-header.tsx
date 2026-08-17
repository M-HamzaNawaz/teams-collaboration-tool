/**
 * PageHeader (JobPulse §3.3) — every in-shell screen opens the same way:
 * a small muted breadcrumb label, a 28px display title, a one-line body
 * description, and right-aligned actions on the same baseline row.
 */
export function PageHeader(props: {
  breadcrumb: string
  title: string
  description?: React.ReactNode
  actions?: React.ReactNode
}) {
  return (
    // Mobile: the title block owns the full width and actions drop BELOW —
    // sharing a row squeezed "Hello, Usman" into a one-word-per-line column.
    <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
      <div className="min-w-0 sm:flex-1">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">
          {props.breadcrumb}
        </p>
        <h1 className="mt-0.5 text-[28px] font-bold leading-[34px] tracking-tight">
          {props.title}
        </h1>
        {props.description && (
          <p className="mt-1 text-sm text-ink-2">{props.description}</p>
        )}
      </div>
      {props.actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {props.actions}
        </div>
      )}
    </header>
  )
}
