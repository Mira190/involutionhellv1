export interface RelatedCandidate {
  path: string;
  slugs: string[];
  title: string;
  tags: string[];
  docId?: string;
}

export interface RelatedResult {
  slugs: string[];
  title: string;
  score: number;
}

const MAX_RELATED = 4;

function dirOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

export function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((t): t is string => typeof t === "string")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

export function getRelatedDocs(
  current: RelatedCandidate,
  candidates: RelatedCandidate[],
  max: number = MAX_RELATED,
): RelatedResult[] {
  const currentDir = dirOf(current.path);
  const currentTags = new Set(current.tags);
  const seen = new Set<string>([current.docId ?? current.path]);
  const scored: RelatedResult[] = [];

  for (const c of candidates) {
    const key = c.docId ?? c.path;
    if (seen.has(key) || c.path === current.path) continue;
    seen.add(key);
    if (!c.title) continue;

    let score = 0;
    for (const tag of c.tags) {
      if (currentTags.has(tag)) score += 2;
    }
    if (currentDir && dirOf(c.path) === currentDir) score += 1;
    if (score < 1) continue;

    scored.push({ slugs: c.slugs, title: c.title, score });
  }

  return scored
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, max);
}
