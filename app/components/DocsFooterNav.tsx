import { Link } from "@/i18n/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

interface NeighbourLink {
  url: string;
  name: ReactNode;
}

interface DocsFooterNavProps {
  previous?: NeighbourLink;
  next?: NeighbourLink;
  previousLabel: string;
  nextLabel: string;
}

export function DocsFooterNav({
  previous,
  next,
  previousLabel,
  nextLabel,
}: DocsFooterNavProps) {
  if (!previous && !next) return null;

  return (
    <nav className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {previous ? (
        <Link
          href={previous.url}
          className="group flex flex-col gap-1 rounded-lg border border-border/70 p-4 no-underline transition-colors hover:border-primary/60 hover:bg-accent/40"
        >
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            <ChevronLeft className="h-4 w-4" />
            {previousLabel}
          </span>
          <span className="font-medium text-foreground transition-colors group-hover:text-primary">
            {previous.name}
          </span>
        </Link>
      ) : (
        <div aria-hidden className="hidden sm:block" />
      )}
      {next ? (
        <Link
          href={next.url}
          className="group flex flex-col items-end gap-1 rounded-lg border border-border/70 p-4 text-right no-underline transition-colors hover:border-primary/60 hover:bg-accent/40"
        >
          <span className="flex items-center gap-1 text-sm text-muted-foreground">
            {nextLabel}
            <ChevronRight className="h-4 w-4" />
          </span>
          <span className="font-medium text-foreground transition-colors group-hover:text-primary">
            {next.name}
          </span>
        </Link>
      ) : null}
    </nav>
  );
}
