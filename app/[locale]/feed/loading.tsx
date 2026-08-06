export default function FeedLoading() {
  return (
    <main className="pt-32 pb-16 bg-[var(--background)] min-h-screen">
      <div className="max-w-6xl mx-auto px-6 lg:px-8 animate-pulse" aria-hidden>
        <header className="border-t-4 border-[var(--foreground)] pt-6 mb-10">
          <div className="h-3 w-32 bg-neutral-200 dark:bg-neutral-800" />
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mt-2">
            <div className="flex-1">
              <div className="h-10 md:h-12 w-64 max-w-full bg-neutral-200 dark:bg-neutral-800" />
              <div className="mt-3 h-4 w-full max-w-2xl bg-neutral-200 dark:bg-neutral-800" />
            </div>
            <div className="shrink-0 h-10 w-32 border border-[var(--foreground)]/40" />
          </div>
        </header>

        <div className="h-10 bg-neutral-100 dark:bg-neutral-900 rounded mb-6" />

        <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <li
              key={i}
              className="border border-[var(--foreground)]/60 flex flex-col"
            >
              <div className="p-4 flex flex-col gap-2 flex-1">
                <div className="h-3 w-20 bg-neutral-200 dark:bg-neutral-800" />
                <div className="h-5 w-full bg-neutral-200 dark:bg-neutral-800" />
                <div className="h-5 w-3/4 bg-neutral-200 dark:bg-neutral-800" />
                <div className="h-4 w-full bg-neutral-100 dark:bg-neutral-900" />
                <div className="h-4 w-5/6 bg-neutral-100 dark:bg-neutral-900" />
                <div className="flex items-center gap-1.5 mt-auto pt-1">
                  <div className="h-4 w-12 bg-neutral-100 dark:bg-neutral-900" />
                  <div className="h-4 w-14 bg-neutral-100 dark:bg-neutral-900" />
                </div>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
