/**
 * 防御 i18n middleware 误吃 backend rewrite 路径
 *
 * 历史背景（PR #335 hotfix）：
 *   i18n PR (#330) 改 proxy.ts 用 next-intl middleware 接管全站 locale
 *   routing，但 matcher 的 negative-lookahead 排除组只列了
 *   `api|trpc|_next|_vercel|.*\..*`，漏掉了 next.config.mjs rewrites
 *   里非 /api/ 前缀的 backend proxy 路径（/auth, /oauth, /analytics）。
 *   后果：用户访问 /oauth/render/github → 被 308 redirect 到
 *   /en/oauth/render/github → rewrite source 不匹配带 locale 的版本 →
 *   落到 [locale]/oauth/... 404 → 登录炸。
 *
 * 这个测试就是防同样的事再发生：扫 next.config.mjs 里所有 rewrite
 * source，对每个 source 验证它的第一段路径在 proxy.ts matcher 的排除
 * 组里。任何人加新 rewrite 但忘了改 matcher，CI 会 fail。
 */

import { describe, expect, test } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

/**
 * 静态扫 next.config.mjs，提取所有 rewrites() 函数体里的 source 列表。
 * 不去 require/import 文件（它依赖 sentry wrap + env，加载麻烦），
 * 直接 regex 抓字面量。
 */
function extractRewriteSources(): string[] {
  const content = readFileSync(join(ROOT, "next.config.mjs"), "utf-8");
  // 提取 async rewrites() { ... } 函数体（非贪婪到下一个同级 async/closing）
  const match = content.match(
    /async rewrites\(\)[^{]*\{([\s\S]*?)^\s{2}\},?$/m,
  );
  if (!match) {
    throw new Error(
      "无法定位 next.config.mjs 的 async rewrites() 函数体；正则可能要更新",
    );
  }
  const body = match[1];
  // 抓所有 source: "..." 的字面量（含跨行的 source: \n  "..."）
  const sources = [...body.matchAll(/source:\s*\n?\s*["']([^"']+)["']/g)].map(
    (m) => m[1],
  );
  return sources;
}

/**
 * 解析 proxy.ts matcher 字符串，提取 negative-lookahead 里的排除项。
 * 形如 "/((?!api|trpc|auth|oauth|...|_next|_vercel|.*\\..*).*)"
 * 返回 ['api', 'trpc', 'auth', 'oauth', ...]
 */
function extractMatcherExclusions(): string[] {
  const content = readFileSync(join(ROOT, "proxy.ts"), "utf-8");
  // 找 matcher: "..." 字符串
  const matcherMatch = content.match(/matcher:\s*["'`]([^"'`]+)["'`]/);
  if (!matcherMatch) {
    throw new Error("无法定位 proxy.ts 的 matcher 字段");
  }
  const matcher = matcherMatch[1];
  // 提取 (?!...) 里的内容
  const lookaheadMatch = matcher.match(/\(\?!([^)]+)\)/);
  if (!lookaheadMatch) {
    throw new Error("matcher 不是 negative-lookahead 形式，测试需要改写");
  }
  return lookaheadMatch[1].split("|").map((s) => s.replace(/\\/g, ""));
}

/**
 * 取 path 的第一个非空段。
 * /oauth/render/github → 'oauth'
 * /auth/:path* → 'auth'
 * /api/admin/events → 'api'
 */
function firstSegment(pathLike: string): string {
  return pathLike.split("/").filter(Boolean)[0] ?? "";
}

describe("proxy.ts matcher 必须排除所有 backend rewrite 路径", () => {
  const rewriteSources = extractRewriteSources();
  const exclusions = extractMatcherExclusions();

  test("能扫到 rewrite sources（防 regex 失效静默通过）", () => {
    expect(rewriteSources.length).toBeGreaterThan(0);
  });

  test("matcher 形如 negative-lookahead，能解析出排除组", () => {
    expect(exclusions).toContain("api");
    expect(exclusions).toContain("_next");
  });

  test.each(rewriteSources)(
    'rewrite source "%s" 的第一段必须在 matcher 排除组里',
    (source) => {
      const seg = firstSegment(source);
      // 跳过参数段（如 :path* 不会作为 path 第一段，但兜底）
      if (!seg || seg.startsWith(":")) return;
      expect(
        exclusions,
        `加了新 rewrite 不带 /api/ 前缀的话，必须同步更新 proxy.ts 的 matcher 排除组。
当前缺少 "${seg}"，否则 next-intl middleware 会把请求 redirect 到 /<locale>/${seg}/...
导致 rewrite 不匹配，落到 [locale]/${seg}/... 404（参考 PR #335 登录炸事故）。`,
      ).toContain(seg);
    },
  );
});

/**
 * 同一失败类的另一半：app/ 根目录下不在 [locale] 里的无点号路由段
 * （如 /og/...）同样会被 middleware 劫持成 /<locale>/<seg>/... 404。
 * 带点号的（rss.xml / robots.txt / search.*.json / llms.txt / sitemap.xml）
 * 已被 matcher 的 .*\..* 规则排除，这里只盯无点号的目录段。
 */
describe("proxy.ts matcher 必须排除 app 根下非 [locale] 的无点号路由段", () => {
  const exclusions = extractMatcherExclusions();
  const appRoot = join(ROOT, "app");
  function containsRouteFile(dir: string): boolean {
    return readdirSync(dir, { withFileTypes: true }).some((e) =>
      e.isDirectory()
        ? containsRouteFile(join(dir, e.name))
        : /^(route|page)\.(ts|tsx|js|jsx)$/.test(e.name),
    );
  }
  const routeSegments = readdirSync(appRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter(
      (name) =>
        !name.startsWith("[") &&
        !name.startsWith("_") &&
        !name.includes(".") &&
        name !== "api" &&
        containsRouteFile(join(appRoot, name)),
    );

  test("能扫到至少一个此类路由段（og），防 readdir 失效静默通过", () => {
    expect(routeSegments).toContain("og");
  });

  test.each(routeSegments)(
    'app 根路由段 "%s" 必须在 matcher 排除组里',
    (seg) => {
      expect(
        exclusions,
        `app/${seg}/ 是 [locale] 之外的无点号路由，next-intl middleware 会把
/${seg}/... 307 到 /<locale>/${seg}/... 404。往 proxy.ts matcher 排除组加 "${seg}"。`,
      ).toContain(seg);
    },
  );
});
