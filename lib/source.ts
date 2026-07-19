import { docs } from "@/.source";
import { loader, getSlugs } from "fumadocs-core/source";
import { defineI18n } from "fumadocs-core/i18n";
import { convertSlugToPinyin } from "./leetcode-slug";

/**
 * fumadocs i18n 配置。
 *
 * languages: zh / en；defaultLanguage = zh（社区主体语言，不带后缀的 .mdx
 * 文件视为 zh）。parser='dot' 让 fumadocs 按文件后缀识别语言：
 *
 *   foo.mdx     → zh（默认）
 *   foo.en.mdx  → en
 *   foo.zh.mdx  → zh。英文原文的合法形态是 foo.en.* + foo.zh.* 成对、
 *                无不带后缀文件（leetcode 目录存在此形态）；但同一 base
 *                同时有不带后缀文件和 .zh 文件则冲突（两者都解析为 zh），
 *                scripts/check-translation-integrity.mjs 会报错
 *
 * fallbackLanguage = "zh"：访问 /en/docs/<slug> 时如果对应 .en.mdx 不
 * 存在，回退渲染原文（zh）避免 404。这是文档站的合理用户体验：未翻译
 * 的文章显示中文版好过空白页。
 *
 * hideLocale 在我们的架构里没有作用 —— URL locale 段由 next-intl 中间
 * 件自动加（fumadocs baseUrl 仍为 /docs，next-intl 把整个路径前缀成
 * /<locale>/docs）。fumadocs 自身不再做 URL 重写。
 */
const i18n = defineI18n({
  languages: ["zh", "en"],
  defaultLanguage: "zh",
  parser: "dot",
  fallbackLanguage: "zh",
});

export const source = loader({
  baseUrl: "/docs",
  source: docs.toFumadocsSource(),
  i18n,
  transformers: [
    ({ storage }) => {
      for (const path of storage.getFiles()) {
        const file = storage.read(path);
        if (
          file &&
          file.format === "page" &&
          path.startsWith("career/interview-prep/leetcode/")
        ) {
          const defaultSlugs = getSlugs(path);
          const newSlugs = defaultSlugs.map(convertSlugToPinyin);

          // 强制覆盖 Fumadocs-MDX 预生成的 slugs
          file.slugs = newSlugs;
        }
      }
    },
  ],
});
