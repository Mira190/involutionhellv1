/**
 * leetcode slug 工具单元测试。
 *
 * convertSlugToPinyin / stripLeetcodeFileSuffix 的输出进
 * generated/leetcode-slug-map.json，proxy.ts 在 edge 靠它做 301。
 * 映射错误 = 旧链接 404，这里锁住中文、混排、后缀剥离与幂等性。
 */
import { describe, expect, test } from "vitest";
import {
  convertSlugToPinyin,
  stripLeetcodeFileSuffix,
} from "../lib/leetcode-slug";

describe("convertSlugToPinyin", () => {
  test("纯中文转拼音", () => {
    const out = convertSlugToPinyin("环形链表");
    expect(out).toMatch(/^[a-z0-9-]+$/);
    expect(out).toContain("huan");
  });

  test("中英混排：英文保留、中文转拼音", () => {
    const out = convertSlugToPinyin("LRU缓存");
    expect(out).toMatch(/^[a-z0-9-]+$/);
    expect(out.toLowerCase()).toContain("lru");
  });

  test("已是 ASCII 的 slug 幂等", () => {
    const ascii = "2241-design-an-atm-machine";
    const once = convertSlugToPinyin(ascii);
    expect(convertSlugToPinyin(once)).toBe(once);
  });

  test("特殊字符不产出非法 URL 字符", () => {
    const out = convertSlugToPinyin("142.环形链表II_translated");
    expect(out).not.toMatch(/[^\w-]/);
  });
});

describe("stripLeetcodeFileSuffix", () => {
  test("剥离 .md / .mdx 扩展名", () => {
    expect(stripLeetcodeFileSuffix("2894-divisible.md")).toBe("2894-divisible");
    expect(stripLeetcodeFileSuffix("index.mdx")).toBe("index");
  });

  test("剥离 locale 后缀", () => {
    expect(stripLeetcodeFileSuffix("2241-design-an-atm-machine.zh.md")).toBe(
      "2241-design-an-atm-machine",
    );
    expect(stripLeetcodeFileSuffix("42-trapping-rain-water.en.md")).toBe(
      "42-trapping-rain-water",
    );
  });

  test("中文文件名保留 stem", () => {
    expect(stripLeetcodeFileSuffix("142.环形链表II_translated.md")).toBe(
      "142.环形链表II_translated",
    );
  });

  test("大小写扩展名与无后缀输入", () => {
    expect(stripLeetcodeFileSuffix("FOO.MD")).toBe("FOO");
    expect(stripLeetcodeFileSuffix("no-extension")).toBe("no-extension");
  });
});
