import type { PageTree } from "fumadocs-core/server";

export interface DocsSection {
  slug: string;
  name: string;
}

function findFirstPageUrl(nodes: PageTree.Node[]): string | null {
  for (const node of nodes) {
    if (node.type === "page") return node.url;
    if (node.type === "folder") {
      if (node.index) return node.index.url;
      const nested = findFirstPageUrl(node.children);
      if (nested) return nested;
    }
  }
  return null;
}

// slug 从 url 反推而不是用 folder.name：name 是 ReactNode（可能是 JSX），
// url 段才是稳定的目录名（/docs/<slug>/...）
export function extractTopLevelSections(tree: PageTree.Root): DocsSection[] {
  const sections: DocsSection[] = [];
  const seen = new Set<string>();

  for (const node of tree.children) {
    if (node.type !== "folder") continue;
    const url = node.index?.url ?? findFirstPageUrl(node.children);
    if (!url) continue;

    const segments = url.split("/").filter(Boolean);
    const docsIdx = segments.indexOf("docs");
    const slug = docsIdx >= 0 ? segments[docsIdx + 1] : segments[0];
    if (!slug || seen.has(slug)) continue;

    seen.add(slug);
    sections.push({
      slug,
      name: typeof node.name === "string" && node.name ? node.name : slug,
    });
  }

  return sections;
}
