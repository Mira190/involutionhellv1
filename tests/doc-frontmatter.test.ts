/**
 * parseDocFrontmatter 单元测试。
 *
 * 该函数是 backfill-contributors 的入口过滤器：docId 缺失的文件被跳过，
 * isTranslation=true（有 translatedFrom）的文件不计入贡献者统计。这里的
 * 判定错误会直接污染排行榜数据，所以锁住四类关键行为。
 */
import { describe, expect, test } from "vitest";
import { parseDocFrontmatter } from "../lib/doc-frontmatter";

const doc = (fm: string, body = "正文") => `---\n${fm}\n---\n\n${body}\n`;

describe("parseDocFrontmatter", () => {
  test("完整 frontmatter：docId / title 均取到，非翻译", () => {
    const meta = parseDocFrontmatter(doc('docId: abc123\ntitle: "强化学习"'));
    expect(meta.docId).toBe("abc123");
    expect(meta.title).toBe("强化学习");
    expect(meta.isTranslation).toBe(false);
  });

  test("缺 docId → null（调用方据此跳过该文件）", () => {
    const meta = parseDocFrontmatter(doc('title: "无 id 文档"'));
    expect(meta.docId).toBeNull();
    expect(meta.title).toBe("无 id 文档");
  });

  test("docId 空白字符串等价于缺失", () => {
    const meta = parseDocFrontmatter(doc('docId: "   "\ntitle: x'));
    expect(meta.docId).toBeNull();
  });

  test("有 translatedFrom → isTranslation=true", () => {
    const meta = parseDocFrontmatter(
      doc("docId: abc123\ntitle: RL\ntranslatedFrom: zh"),
    );
    expect(meta.isTranslation).toBe(true);
  });

  test("translatedFrom 为空串不算翻译版", () => {
    const meta = parseDocFrontmatter(doc('docId: abc123\ntranslatedFrom: ""'));
    expect(meta.isTranslation).toBe(false);
  });

  test("无 frontmatter 的纯正文：全部字段安全降级", () => {
    const meta = parseDocFrontmatter("# 只有正文\n\n没有 frontmatter\n");
    expect(meta.docId).toBeNull();
    expect(meta.title).toBeNull();
    expect(meta.isTranslation).toBe(false);
    expect(meta.frontmatter).toEqual({});
  });

  test("frontmatter 其余字段原样透出", () => {
    const meta = parseDocFrontmatter(
      doc("docId: abc123\ntags:\n  - rl\n  - ai"),
    );
    expect(meta.frontmatter.tags).toEqual(["rl", "ai"]);
  });
});
