/**
 * checkTranslationIntegrity 单元测试。
 *
 * 语料同时存在三套命名约定（无后缀 zh + .en 翻译；.en 原文 + .zh 翻译；
 * 中文文件名），自动化流水线跑在这套目录上之前必须能机检出：原文 docId
 * 冲突、孤儿 locale 文件、无后缀与 .zh 并存冲突、lang/后缀不一致、
 * leetcode 同题多套文件名。
 */
import { describe, expect, test } from "vitest";
import {
  baseStemOf,
  checkTranslationIntegrity,
  localeSuffixOf,
  type DocFileMeta,
} from "../lib/translation-integrity";

const f = (
  path: string,
  over: Partial<Omit<DocFileMeta, "path">> = {},
): DocFileMeta => ({
  path,
  docId: over.docId !== undefined ? over.docId : "id-" + path,
  lang: over.lang ?? null,
  translatedFrom: over.translatedFrom ?? null,
});

const rules = (fs: DocFileMeta[]) =>
  checkTranslationIntegrity(fs).map((x) => x.rule);

describe("suffix helpers", () => {
  test("localeSuffixOf / baseStemOf", () => {
    expect(localeSuffixOf("a/b.en.mdx")).toBe("en");
    expect(localeSuffixOf("a/b.zh.md")).toBe("zh");
    expect(localeSuffixOf("a/b.mdx")).toBeNull();
    expect(baseStemOf("a/b.en.mdx")).toBe("a/b");
    expect(baseStemOf("a/b.mdx")).toBe("a/b");
  });
});

describe("checkTranslationIntegrity", () => {
  test("健康配对：无后缀 zh + .en 翻译 → 零发现", () => {
    const out = checkTranslationIntegrity([
      f("d/x.mdx", { docId: "id1", lang: "zh" }),
      f("d/x.en.mdx", { docId: "id1", lang: "en", translatedFrom: "zh" }),
    ]);
    expect(out).toHaveLength(0);
  });

  test("健康配对：.en 原文 + .zh 翻译 → 零发现", () => {
    const out = checkTranslationIntegrity([
      f("d/y.en.md", { docId: "id2", lang: "en" }),
      f("d/y.zh.md", { docId: "id2", lang: "zh", translatedFrom: "en" }),
    ]);
    expect(out).toHaveLength(0);
  });

  test("原文 docId 冲突报 error", () => {
    const out = rules([
      f("a.mdx", { docId: "dup" }),
      f("b.mdx", { docId: "dup" }),
    ]);
    expect(out).toContain("duplicate-original-docid");
  });

  test("翻译版继承同 docId 不算冲突", () => {
    const out = rules([
      f("a.mdx", { docId: "same", lang: "zh" }),
      f("a.en.mdx", { docId: "same", lang: "en", translatedFrom: "zh" }),
    ]);
    expect(out).not.toContain("duplicate-original-docid");
  });

  test("孤儿 .en 文件报 error", () => {
    expect(rules([f("d/only.en.mdx", { lang: "en" })])).toContain(
      "orphan-locale-file",
    );
  });

  test("无后缀与 .zh 并存报 error", () => {
    const out = rules([
      f("d/z.md", { lang: "zh" }),
      f("d/z.zh.md", { lang: "zh", translatedFrom: "en", docId: "id-z2" }),
    ]);
    expect(out).toContain("unsuffixed-zh-conflict");
  });

  test("lang 与后缀不一致报 error", () => {
    const out = rules([
      f("d/w.mdx", { lang: "zh" }),
      f("d/w.en.mdx", { lang: "zh", translatedFrom: "zh", docId: "id-w" }),
    ]);
    expect(out).toContain("lang-suffix-mismatch");
    expect(out).toContain("self-translation");
  });

  test("翻译缺 docId 报 warning", () => {
    const out = checkTranslationIntegrity([
      f("d/v.mdx", { lang: "zh", docId: "id-v" }),
      f("d/v.en.mdx", { lang: "en", translatedFrom: "zh", docId: null }),
    ]);
    expect(out.find((x) => x.rule === "translation-missing-docid")?.level).toBe(
      "warning",
    );
  });

  test("leetcode 同题号多套文件名报 warning", () => {
    const dir = "content/docs/career/interview-prep/leetcode/";
    const out = rules([
      f(`${dir}2894. 分类求和并作差.md`, { lang: "zh", docId: "id-a" }),
      f(`${dir}2894-divisible-sums.en.md`, { lang: "en", docId: "id-b" }),
      f(`${dir}2894-divisible-sums.zh.md`, {
        lang: "zh",
        translatedFrom: "en",
        docId: "id-b",
      }),
    ]);
    expect(out).toContain("leetcode-number-duplicate");
  });

  test("errors 排在 warnings 前", () => {
    const out = checkTranslationIntegrity([
      f("d/only.en.mdx", { lang: "en" }),
      f("content/docs/career/interview-prep/leetcode/1-a.md", { docId: "l1" }),
      f("content/docs/career/interview-prep/leetcode/1-b.md", { docId: "l2" }),
    ]);
    expect(out[0].level).toBe("error");
    expect(out[out.length - 1].level).toBe("warning");
  });
});
