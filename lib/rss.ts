import { source } from "@/lib/source";
import { SITE_URL } from "@/lib/site-url";
import { ensureSeoDescription } from "@/lib/seo-description";
import { type Locale } from "@/i18n/routing";
import { type PageData } from "@/app/types/doc";
import {
  extractDateFromPage,
  isDraftOrHidden,
  sanitizeSlugPath,
  type SourcePage,
} from "@/lib/doc-page-meta";

const MAX_ITEMS = 30;

export const RSS_FEEDS: Record<Locale, { path: string; title: string }> = {
  zh: { path: "/rss.xml", title: "Involution Hell 文档更新" },
  en: { path: "/rss.en.xml", title: "Involution Hell Docs Updates" },
};

const CHANNEL_DESCRIPTION: Record<Locale, string> = {
  zh: "内卷地狱社区文档最新更新 — 算法、系统设计、面试经验与求职指南。",
  en: "Latest updates from the Involution Hell community docs — algorithms, system design, and interview prep.",
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

interface FeedEntry {
  page: SourcePage;
  date: Date;
}

function latestDocs(locale: Locale): FeedEntry[] {
  return source
    .getPages(locale)
    .filter((page) => !isDraftOrHidden(page))
    .flatMap((page) => {
      const date = extractDateFromPage(page);
      return date ? [{ page, date }] : [];
    })
    .sort((a, b) => b.date.getTime() - a.date.getTime())
    .slice(0, MAX_ITEMS);
}

function renderItem({ page, date }: FeedEntry, locale: Locale): string {
  const data = (page.data ?? {}) as PageData;
  const slugPath = sanitizeSlugPath(page.slugs);
  const link = slugPath
    ? `${SITE_URL}/${locale}/docs/${slugPath}`
    : `${SITE_URL}/${locale}/docs`;
  const title = data.title ?? page.slugs[page.slugs.length - 1] ?? "docs";
  const description = ensureSeoDescription({
    description: data.description,
    title: data.title,
    sectionPath: page.slugs.slice(0, -1),
    locale,
  });
  return [
    "    <item>",
    `      <title>${escapeXml(title)}</title>`,
    `      <link>${escapeXml(link)}</link>`,
    `      <guid isPermaLink="true">${escapeXml(link)}</guid>`,
    `      <description>${escapeXml(description)}</description>`,
    `      <pubDate>${date.toUTCString()}</pubDate>`,
    "    </item>",
  ].join("\n");
}

export function buildRssXml(locale: Locale): string {
  const feed = RSS_FEEDS[locale];
  const docsUrl = `${SITE_URL}/${locale}/docs`;
  const entries = latestDocs(locale);
  const lastBuildDate = entries[0]?.date ?? new Date(0);
  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">`,
    "  <channel>",
    `    <title>${escapeXml(feed.title)}</title>`,
    `    <link>${escapeXml(docsUrl)}</link>`,
    `    <description>${escapeXml(CHANNEL_DESCRIPTION[locale])}</description>`,
    `    <language>${locale === "en" ? "en-US" : "zh-CN"}</language>`,
    `    <lastBuildDate>${lastBuildDate.toUTCString()}</lastBuildDate>`,
    `    <atom:link href="${escapeXml(`${SITE_URL}${feed.path}`)}" rel="self" type="application/rss+xml"/>`,
    ...entries.map((entry) => renderItem(entry, locale)),
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
