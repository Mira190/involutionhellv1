// tests/i18n-source.test.ts

/**
 * i18n 语料/loader 不变量测试。
 *
 * 用「真实语料 + 虚拟文件 loader」探针：扫 content/docs 的 frontmatter
 * （gray-matter，不编译 MDX），喂给与 lib/source.ts 同配置的 fumadocs
 * loader。这是唯一能测出 dot parser 丢文件、fallback 继承、搜索分片
 * 空转这类问题的方法 —— 文件名 shell 扫描推断不了 loader 行为。
 *
 * 刻意不 import `@/lib/source`（需要 fumadocs-mdx 编译产物 .source，
 * vitest 没配该管线）。i18n 配置在这里手动镜像，如果 lib/source.ts 的
 * i18n 配置改了，这里必须同步。
 */

import { describe, expect, it } from "vitest";
import { loader } from "fumadocs-core/source";
import { defineI18n } from "fumadocs-core/i18n";
import fg from "fast-glob";
import matter from "gray-matter";
import fs from "node:fs";
import path from "node:path";
import { isEnglishFile, getTranslationStatus } from "@/lib/translation-status";

const DOCS_DIR = path.resolve(__dirname, "../content/docs");

// 与 lib/source.ts 保持一致
const i18n = defineI18n({
  languages: ["zh", "en"],
  defaultLanguage: "zh",
  parser: "dot",
  fallbackLanguage: "zh",
});

function buildProbeSource() {
  const files = fg
    .sync(`${DOCS_DIR.replaceAll("\\", "/")}/**/*.{md,mdx}`, {
      onlyFiles: true,
    })
    .map((abs) => {
      const rel = path.relative(DOCS_DIR, abs).replaceAll("\\", "/");
      const { data } = matter(fs.readFileSync(abs, "utf8"));
      return { type: "page" as const, path: rel, data };
    });
  return loader({
    baseUrl: "/docs",
    i18n,
    source: { files },
  });
}

const probe = buildProbeSource();

describe("搜索分片非空（B 类回归：en 分片曾恒为空）", () => {
  it("en 页面表包含真实 .en 文件，且数量 >= 100", () => {
    const enReal = probe.getPages("en").filter((p) => isEnglishFile(p.path));
    expect(enReal.length).toBeGreaterThanOrEqual(100);
  });

  it("zh 页面表非空且数量 >= 100", () => {
    const zh = probe.getPages("zh").filter((p) => !isEnglishFile(p.path));
    expect(zh.length).toBeGreaterThanOrEqual(100);
  });

  it("不传 locale 的 getPages() 不含 .en 文件（en 分片必须显式传 'en'）", () => {
    const defaultPages = probe.getPages();
    expect(defaultPages.some((p) => isEnglishFile(p.path))).toBe(false);
  });
});

describe("fallback / 翻译状态判定", () => {
  it("en 页面表里存在 fallback（zh 原文件被继承到 en locale）", () => {
    const fallbacks = probe
      .getPages("en")
      .filter((p) => getTranslationStatus(p, "en").kind === "fallback");
    // 语料里存在未翻译的 zh 文档，fallback 数量 > 0；若未来全部翻完可放宽为 >= 0
    expect(fallbacks.length).toBeGreaterThan(0);
  });

  it(".en 翻译文件被判为 translation（frontmatter translatedFrom 生效）", () => {
    const en = probe
      .getPages("en")
      .filter((p) => isEnglishFile(p.path))
      .map((p) => getTranslationStatus(p, "en"));
    expect(en.filter((s) => s.kind === "translation").length).toBeGreaterThan(
      50,
    );
  });
});

describe("frontmatter schema 保留自定义字段（B 类回归：默认 schema 剥字段）", () => {
  it("source.config 的 schema 保留 docId/lang/translatedFrom 等自定义字段", async () => {
    const { docs } = await import("../source.config");
    // CollectionSchema 类型是 ZodObject | 工厂函数 的联合；这里配置的是前者
    const schema = docs.docs.schema as unknown as {
      parse: (v: unknown) => Record<string, unknown>;
    };
    expect(typeof schema?.parse).toBe("function");
    const parsed = schema.parse({
      title: "T",
      description: "d",
      docId: "abc123",
      lang: "en",
      translatedFrom: "zh",
      translatedAt: "2026-04-15T12:00:00Z",
      translatorAgent: "claude-sonnet-4-6",
      date: "2024.01.01 0:00",
      tags: ["a"],
      abbrlink: "ff2a",
      draft: true,
    });
    expect(parsed.docId).toBe("abc123");
    expect(parsed.lang).toBe("en");
    expect(parsed.translatedFrom).toBe("zh");
    expect(parsed.draft).toBe(true);
    expect(parsed.abbrlink).toBe("ff2a");
  });
});
