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
 *   foo.zh.mdx  → 与 foo.mdx 冲突，仓库里不应该出现这种命名（已批量
 *                normalize 过：把英文原文重命名为 .en.mdx，把 .zh.mdx
 *                改为不带后缀）
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

/**
 * 判断某语言版本是否真实存在（而非 fallback 顶替）。
 *
 * fallbackLanguage='zh' 会让 getPage(slug, 'en') 在 .en.mdx 缺失时返回 zh
 * 原文，且返回的 page.locale 仍标为 'en'——locale 字段说的是"请求的语言"
 * 而不是"文件的语言"。只有原始文件路径（.en 后缀有无）能区分真假翻译，
 * 所以用 path 与 fallback 语言的 page 对比。
 */
export function hasLanguageVersion(
  slug: string[] | undefined,
  locale: string,
): boolean {
  const fallbackLanguage = i18n.fallbackLanguage ?? i18n.defaultLanguage;
  const page = source.getPage(slug, locale);
  if (page == null) return false;
  if (locale === fallbackLanguage) return true;
  const fallback = source.getPage(slug, fallbackLanguage);
  return fallback == null || page.path !== fallback.path;
}

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
