// lib/translation-status.ts

/**
 * @file lib/translation-status.ts
 * @description
 * 文档页的翻译状态判定，docs page / sitemap / llms.txt / 搜索分片共用。
 *
 * fallback 判定用**文件路径后缀**而不是 frontmatter：fumadocs 的
 * fallbackLanguage="zh" 会在 /en URL 下渲染 zh 原文件，此时 page.data 是
 * 原文的 frontmatter（没有任何"我是 fallback"的标记），只有 page.path
 * 能区分（真翻译版路径带 .en. 后缀）。
 *
 * 刻意不 import `@/lib/source`（同 lib/doc-entry.ts：避免把 fumadocs-mdx
 * 管线拖进 vitest）。
 */

import type { PageData } from "@/app/types/doc";

export type TranslationStatus =
  | { kind: "original" }
  | {
      kind: "translation";
      translatedFrom: string;
      translatorAgent?: string;
    }
  | { kind: "fallback" };

/** 文件路径是否为英文内容文件（foo.en.md / foo.en.mdx）。 */
export function isEnglishFile(path: string): boolean {
  return /\.en\.(md|mdx)$/i.test(path);
}

export function getTranslationStatus(
  page: { path: string; data?: unknown },
  locale: string,
): TranslationStatus {
  if (locale === "en" && !isEnglishFile(page.path)) {
    return { kind: "fallback" };
  }
  const d = (page.data ?? {}) as PageData;
  const translatedFrom = d.translatedFrom ?? d.frontmatter?.translatedFrom;
  if (typeof translatedFrom === "string" && translatedFrom.length > 0) {
    return {
      kind: "translation",
      translatedFrom,
      translatorAgent:
        typeof d.translatorAgent === "string" ? d.translatorAgent : undefined,
    };
  }
  return { kind: "original" };
}
