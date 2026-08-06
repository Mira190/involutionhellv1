import { source } from "@/lib/source";
import { type PageData, type DateLike } from "@/app/types/doc";

export { isDraftOrHidden } from "@/lib/doc-entry";

export type SourcePage = ReturnType<typeof source.getPages>[number];

export function extractDateFromPage(page: SourcePage): Date | undefined {
  const data = (page.data ?? {}) as PageData;
  const candidates: DateLike[] = [
    data?.updatedAt,
    data?.updated,
    data?.lastUpdated,
    data?.frontmatter?.updatedAt,
    data?.frontmatter?.updated,
    data?.frontmatter?.lastUpdated,
    data?.date,
    data?.frontmatter?.date,
  ];
  for (const c of candidates) {
    const parsed = normalizeDate(c);
    if (parsed) return parsed;
  }
  return undefined;
}

function normalizeDate(value: DateLike): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) {
    return isNaN(value.getTime()) ? undefined : value;
  }
  const d = new Date(value);
  return isNaN(d.getTime()) ? undefined : d;
}

export function sanitizeSlugPath(slugs: string[]): string {
  return slugs
    .filter(Boolean)
    .map((s) => encodeURIComponent(s))
    .join("/");
}

