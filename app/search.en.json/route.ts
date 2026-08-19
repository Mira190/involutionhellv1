import { createSearchAPI } from "fumadocs-core/search/server";
import { source } from "@/lib/source";
import { pageToIndex, isEnglishPage } from "@/lib/search-index";

export const dynamic = "force-static";

/**
 * 英文搜索索引分片：只包含真实 .en 内容文件，用 Orama 默认英文分词
 * （无需 mandarin tokenizer）。
 *
 * 必须传 getPages("en")：不传 locale 时 fumadocs 默认返回 defaultLanguage
 * （zh）的页面表，里面永远不含 .en 文件 —— 那样这个分片恒为空。
 * en 页面表里 fallback 继承的 zh 原文件由 isEnglishPage（路径判据）排除。
 */
const api = createSearchAPI("advanced", {
  indexes: () =>
    Promise.all(source.getPages("en").filter(isEnglishPage).map(pageToIndex)),
  language: "english",
  search: {
    threshold: 0.3,
    tolerance: 1,
  },
});

export const GET = api.staticGET;
