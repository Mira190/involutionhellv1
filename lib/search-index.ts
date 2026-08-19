import type { AdvancedIndex } from "fumadocs-core/search/server";
// StructuredData 是 fumadocs-core 的公开导出（从 mdx-plugins 入口），
// 直接用上游类型，不再在本地维护同形副本以免两边 drift。
import type { StructuredData } from "fumadocs-core/mdx-plugins";
import { source } from "@/lib/source";
import { basename, extname } from "path";
import { type PageData } from "@/app/types/doc";
import { isEnglishFile } from "@/lib/translation-status";

type Page = ReturnType<typeof source.getPages>[number];

/**
 * 把一个 fumadocs 页面转成 Orama 索引项（复用 fumadocs-core 默认实现逻辑），
 * 单独抽出来是因为我们需要分片（zh / en），用 createSearchAPI 手动传 indexes。
 */
export async function pageToIndex(page: Page): Promise<AdvancedIndex> {
  const data = page.data as PageData;

  let structuredData: StructuredData | undefined;
  if (data.structuredData) {
    structuredData = data.structuredData;
  } else if (typeof data.load === "function") {
    structuredData = (await data.load()).structuredData;
  }

  if (!structuredData) {
    throw new Error(
      `[search-index] 页面缺少 structuredData: ${page.path ?? page.url}`,
    );
  }

  return {
    id: page.url,
    title: data.title ?? basename(page.path, extname(page.path)),
    description: data.description,
    url: page.url,
    structuredData,
  };
}

/**
 * 判断一个 fumadocs 页面是否为英文内容文件。
 *
 * 用文件路径后缀（.en.md/.en.mdx）而不是 frontmatter lang 字段：
 * en locale 的 getPages("en") 会包含 fallback 继承的 zh 原文件，
 * 只有路径能把真英文文件和 fallback 区分开。
 */
export function isEnglishPage(page: Page): boolean {
  return isEnglishFile(page.path);
}
