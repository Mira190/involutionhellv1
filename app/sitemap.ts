// app/sitemap.ts

/**
 * @file app/sitemap.ts
 * @description
 * 站点地图 (Sitemap) 生成器。
 *
 * Next.js 在构建时（静态导出）调用这个文件生成 sitemap.xml。
 *
 * i18n URL 段化改造（2026-05）后的关键变化：
 *   - 每条 URL 都带 /<locale>/ 前缀（/zh、/en）
 *   - 每条 entry 用 alternates.languages 列出另一语言的 URL，让 Google
 *     正确识别 hreflang 关系（不会把 zh / en 当成两个独立页争 PageRank）
 *   - 同一篇文档在 zh / en sitemap 各占一条
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/sitemap
 */

import type { MetadataRoute } from "next";
import { source } from "@/lib/source";
import leaderboard from "@/generated/site-leaderboard.json";
import { SITE_URL } from "@/lib/site-url";
import { routing, type Locale } from "@/i18n/routing";
import { type PageData, type DateLike } from "@/app/types/doc";
// 和 app/llms.txt/route.ts 共用，避免两边对 draft 过滤 / slug 编码各写一份
import { docPathname, isDraftOrHidden } from "@/lib/doc-entry";
import { isEnglishFile } from "@/lib/translation-status";

type SourcePage = ReturnType<typeof source.getPages>[number];

/**
 * Next.js 调用的默认导出函数，生成整个站点的 Sitemap。
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const entries: MetadataRoute.Sitemap = [];

  // 1. 每个 locale 的首页 + /rank
  let latestDocDate: Date | null = null;
  for (const locale of routing.locales) {
    const homeEntry = buildLocaleEntry({
      pathname: "",
      currentLocale: locale,
      changeFrequency: "weekly",
      priority: 1,
    });
    entries.push(homeEntry);

    entries.push(
      buildLocaleEntry({
        pathname: "/rank",
        currentLocale: locale,
        changeFrequency: "daily",
        priority: 0.7,
      }),
    );

    entries.push(
      buildLocaleEntry({
        pathname: "/feed",
        currentLocale: locale,
        changeFrequency: "daily",
        priority: 0.7,
      }),
    );

    entries.push(
      buildLocaleEntry({
        pathname: "/events",
        currentLocale: locale,
        changeFrequency: "weekly",
        priority: 0.6,
      }),
    );
  }

  // 2. 文档页面：每个 locale 拿一份，按 fumadocs i18n 接口取。
  //
  // fallback 排除 + 配对感知（不能无脑双语双份）：
  //   - en 页面表包含 fallbackLanguage 继承的 zh 原文件——那些 /en URL 渲染
  //     中文正文，进 sitemap 等于给 Google 报重复内容，跳过
  //   - alternates 只在真实配对存在时输出；en-only 孤儿页的 zh URL 是 404，
  //     宣告出去 hreflang 互指失败整组作废
  const realEnSlugs = new Set(
    source
      .getPages("en")
      .filter((p) => isEnglishFile(p.path))
      .map((p) => p.slugs.join("/")),
  );
  const zhSlugs = new Set(source.getPages("zh").map((p) => p.slugs.join("/")));
  for (const locale of routing.locales) {
    const pages = source.getPages(locale);
    for (const page of pages) {
      if (isDraftOrHidden(page)) continue;
      if (locale === "en" && !isEnglishFile(page.path)) continue;
      const slugKey = page.slugs.join("/");
      const hasPair = realEnSlugs.has(slugKey) && zhSlugs.has(slugKey);
      const entry = buildDocsEntry(page, locale, hasPair);
      entries.push(entry);
      if (entry.lastModified instanceof Date) {
        if (!latestDocDate || entry.lastModified > latestDocDate) {
          latestDocDate = entry.lastModified;
        }
      }
    }
  }

  // 3. 个人主页 /u/[githubId]：从 build-time leaderboard JSON 枚举所有贡献者。
  // 非贡献者 / 新注册用户的 profile 不入 sitemap（爬虫进去也是空白，浪费 crawl budget）。
  // hasProfile=false 的（git 贡献者但未注册本站）也排除——他们的 /u/{id}
  // 只是兜底页且 robots noindex，进 sitemap 纯属邀请爬虫来爬死链。
  type LeaderboardRow = { id?: string; hasProfile?: boolean };
  for (const locale of routing.locales) {
    for (const row of leaderboard as LeaderboardRow[]) {
      if (typeof row.id !== "string" || !/^\d+$/.test(row.id)) continue;
      if (row.hasProfile !== true) continue;
      entries.push(
        buildLocaleEntry({
          pathname: `/u/${row.id}`,
          currentLocale: locale,
          changeFrequency: "weekly",
          priority: 0.5,
        }),
      );
    }
  }

  // 4. 去重 + 排序（保持构建产物稳定）
  const unique = new Map(entries.map((e) => [e.url, e]));
  return [...unique.values()].sort((a, b) => a.url.localeCompare(b.url));
}

interface BuildLocaleEntryArgs {
  pathname: string;
  currentLocale: Locale;
  changeFrequency: NonNullable<
    MetadataRoute.Sitemap[number]["changeFrequency"]
  >;
  priority: number;
  lastModified?: Date;
  /** false = 不输出 alternates（单语言页 / 对语言 URL 不存在） */
  withAlternates?: boolean;
}

/**
 * 通用：给 (pathname, locale) 构建一条 sitemap 入口。
 *
 * hreflang 语言码与 generateMetadata（docs page.tsx）保持字节一致：
 * zh-Hans / en + x-default 指 zh —— head 与 sitemap 两个声明源不一致是
 * Google 文档明确警告的冲突模式。
 */
function buildLocaleEntry({
  pathname,
  currentLocale,
  changeFrequency,
  priority,
  lastModified,
  withAlternates = true,
}: BuildLocaleEntryArgs): MetadataRoute.Sitemap[number] {
  const url = `${SITE_URL}/${currentLocale}${pathname}`;
  const languages: Record<string, string> = {
    "zh-Hans": `${SITE_URL}/zh${pathname}`,
    en: `${SITE_URL}/en${pathname}`,
    "x-default": `${SITE_URL}/zh${pathname}`,
  };
  return {
    url,
    changeFrequency,
    priority,
    ...(lastModified ? { lastModified } : {}),
    ...(withAlternates ? { alternates: { languages } } : {}),
  };
}

/**
 * 文档页 sitemap 条目。
 *
 * fumadocs i18n 接入后 source.getPages(locale) 返回该 locale 已经
 * fallback 处理过的 pages，page.slugs 是 base slug（不含 .en/.zh 后缀）。
 */
function buildDocsEntry(
  page: SourcePage,
  locale: Locale,
  hasPair: boolean,
): MetadataRoute.Sitemap[number] {
  const pathname = docPathname(page.slugs);
  const fmDate = extractDateFromPage(page);
  return buildLocaleEntry({
    pathname,
    currentLocale: locale,
    changeFrequency: "monthly",
    priority: 0.6,
    lastModified: fmDate,
    withAlternates: hasPair,
  });
}

function extractDateFromPage(page: SourcePage): Date | undefined {
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
