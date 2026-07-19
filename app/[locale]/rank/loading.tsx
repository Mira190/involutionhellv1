export default function RankLoading() {
  return (
    <main className="min-h-screen pt-32 pb-16 newsprint-texture">
      <div
        className="container mx-auto px-6 max-w-4xl animate-pulse"
        aria-hidden
      >
        <div className="mb-12 border-b-4 border-[var(--foreground)] pb-4">
          <div className="h-12 md:h-16 w-72 max-w-full bg-neutral-200 dark:bg-neutral-800" />
          <div className="mt-4 h-4 w-96 max-w-full bg-neutral-200 dark:bg-neutral-800" />
        </div>

        <div className="flex gap-2 mb-8">
          <div className="h-9 w-32 border border-[var(--foreground)]/40 bg-neutral-100 dark:bg-neutral-900" />
          <div className="h-9 w-32 border border-[var(--foreground)]/40" />
        </div>

        <div className="flex flex-col gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col md:flex-row md:items-center gap-4 border border-[var(--foreground)]/60 p-4 bg-[var(--background)]"
            >
              <div className="h-8 w-12 bg-neutral-200 dark:bg-neutral-800 shrink-0" />
              <div className="w-12 h-12 bg-neutral-200 dark:bg-neutral-800 border border-[var(--foreground)]/40 shrink-0" />
              <div className="flex-1 min-w-[150px]">
                <div className="h-5 w-40 max-w-full bg-neutral-200 dark:bg-neutral-800" />
                <div className="mt-2 h-3 w-24 bg-neutral-100 dark:bg-neutral-900" />
              </div>
              <div className="w-full md:w-64 lg:w-96 h-6 border border-[var(--foreground)]/40 bg-neutral-100 dark:bg-neutral-900 shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
