import path from "node:path";

export const IMAGE_FILE_EXTS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
]);

const markdownImageRe = () => /!\[[^\]]*\]\(([^)]+)\)/g;
const htmlImageRe = () => /<img[^>]*src=["']([^"']+)["'][^>]*>/gi;

/**
 * @returns {{ url: string, kind: "markdown" | "html" }[]} 按出现顺序去重
 */
export function extractImageRefs(content) {
  const refs = [];
  const seen = new Set();
  for (const [kind, re] of [
    ["markdown", markdownImageRe()],
    ["html", htmlImageRe()],
  ]) {
    for (const m of content.matchAll(re)) {
      const url = m[1];
      if (seen.has(url)) continue;
      seen.add(url);
      refs.push({ url, kind });
    }
  }
  return refs;
}

export function extractImageUrls(content) {
  return extractImageRefs(content).map((r) => r.url);
}

export function isRemoteUrl(url) {
  return /^https?:\/\//i.test(url) || url.startsWith("//");
}

export function isRelativePath(url) {
  if (isRemoteUrl(url)) return false;
  if (url.startsWith("/")) return false;
  if (/^[a-z][a-z0-9+.-]*:/i.test(url)) return false;
  return true;
}

/**
 * 只改写图片语法内部的 URL，避免误伤正文里恰好相同的文本。
 * @param {string} content
 * @param {Map<string, string>} replacements url -> newUrl
 */
export function rewriteImageRefs(content, replacements) {
  const rewrite = (match, url) =>
    replacements.has(url)
      ? match.replace(url, () => replacements.get(url))
      : match;
  return content
    .replace(markdownImageRe(), rewrite)
    .replace(htmlImageRe(), rewrite);
}

export function buildR2Key(docId, filename) {
  return `docs/${docId}/${filename}`;
}

/**
 * 同一文档内不同目录可能有同名图片，重名时追加 -1/-2 后缀。
 * 调用方负责把返回值加进 usedNames。
 */
export function dedupeFilename(filename, usedNames) {
  if (!usedNames.has(filename)) return filename;
  const ext = path.extname(filename);
  const base = filename.slice(0, filename.length - ext.length);
  let i = 1;
  let candidate = `${base}-${i}${ext}`;
  while (usedNames.has(candidate)) {
    i++;
    candidate = `${base}-${i}${ext}`;
  }
  return candidate;
}

const CONTENT_TYPES = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".avif": "image/avif",
};

export function contentTypeForExtension(ext) {
  return CONTENT_TYPES[ext.toLowerCase()] ?? "application/octet-stream";
}
