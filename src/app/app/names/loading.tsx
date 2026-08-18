/** Names transition skeleton — narrow column of request cards. */
export default function NamesLoading() {
  return (
    <div className="mx-auto h-full w-full max-w-190 overflow-hidden p-4 md:px-10 md:py-8">
      <div className="mb-6">
        <div className="skeleton h-3 w-16" />
        <div className="skeleton mt-2 h-8 w-64" />
        <div className="skeleton mt-2 h-4 w-96" />
      </div>
      <div className="flex flex-col gap-4">
        <div className="skeleton h-32" />
        <div className="skeleton h-32" />
      </div>
    </div>
  )
}
