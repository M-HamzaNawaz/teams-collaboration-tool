/** Moderation transition skeleton — narrow column of held-message cards. */
export default function ModerationLoading() {
  return (
    <div className="mx-auto h-full w-full max-w-190 overflow-hidden p-4 md:px-10 md:py-8">
      <div className="mb-6">
        <div className="skeleton h-3 w-16" />
        <div className="skeleton mt-2 h-8 w-72" />
        <div className="skeleton mt-2 h-4 w-80" />
      </div>
      <div className="flex flex-col gap-4">
        <div className="skeleton h-36" />
        <div className="skeleton h-36" />
        <div className="skeleton h-36" />
      </div>
    </div>
  )
}
