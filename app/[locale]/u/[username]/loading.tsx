export default function ProfileLoading() {
  return (
    <main className="pt-32 pb-16 bg-[var(--background)] min-h-screen">
      <div className="max-w-7xl mx-auto px-6 lg:px-8 animate-pulse" aria-hidden>
        <header className="border-t-4 border-[var(--foreground)] pt-6 mb-12">
          <div className="h-3 w-40 bg-neutral-200 dark:bg-neutral-800" />
          <div className="h-10 md:h-12 w-72 max-w-full mt-2 bg-neutral-200 dark:bg-neutral-800" />
        </header>

        <div className="grid grid-cols-12 gap-8">
          <section className="col-span-12 lg:col-span-5 border border-[var(--foreground)]/60 p-8 lg:p-10 flex flex-col gap-6 self-start">
            <div className="h-3 w-16 bg-neutral-100 dark:bg-neutral-900" />
            <div className="w-24 h-24 border-2 border-[var(--foreground)]/40 bg-neutral-200 dark:bg-neutral-800" />
            <div>
              <div className="h-9 w-48 max-w-full bg-neutral-200 dark:bg-neutral-800" />
              <div className="mt-2 h-3 w-28 bg-neutral-100 dark:bg-neutral-900" />
            </div>
            <div className="border-t border-[var(--foreground)]/40 pt-4 flex flex-col gap-2">
              <div className="h-4 w-full bg-neutral-100 dark:bg-neutral-900" />
              <div className="h-4 w-5/6 bg-neutral-100 dark:bg-neutral-900" />
            </div>
            <div className="border-t border-[var(--foreground)]/40 pt-4 grid grid-cols-3 gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i}>
                  <div className="h-8 w-12 bg-neutral-200 dark:bg-neutral-800" />
                  <div className="mt-2 h-2 w-16 bg-neutral-100 dark:bg-neutral-900" />
                </div>
              ))}
            </div>
          </section>

          <div className="col-span-12 lg:col-span-7">
            <div className="h-full grid grid-cols-1 sm:grid-cols-2 gap-8">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="border border-[var(--foreground)]/60 p-6 flex flex-col gap-3"
                >
                  <div className="h-3 w-14 bg-neutral-100 dark:bg-neutral-900" />
                  <div className="h-6 w-3/4 bg-neutral-200 dark:bg-neutral-800" />
                  <div className="h-4 w-full bg-neutral-100 dark:bg-neutral-900" />
                  <div className="h-4 w-2/3 bg-neutral-100 dark:bg-neutral-900" />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
