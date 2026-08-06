import matter from "gray-matter";

export function parseDocFrontmatter(content: string) {
  const parsed = matter(content);
  const data = parsed.data || {};
  const docId = typeof data.docId === "string" ? data.docId.trim() : "";
  const title = typeof data.title === "string" ? data.title.trim() : "";
  // 有 translatedFrom 字段即为翻译版，不计入贡献者统计
  const isTranslation =
    typeof data.translatedFrom === "string" && data.translatedFrom.length > 0;
  return {
    docId: docId || null,
    title: title || null,
    isTranslation,
    frontmatter: data,
  };
}
