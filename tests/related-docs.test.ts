/**
 * getRelatedDocs 单元测试。
 *
 * 评分规则：共享 tag 每个 +2、同目录 +1，score < 1 不入选（宁缺毋滥），
 * 翻译版由调用方按 docId 去重（同 docId 只保留首个候选）。
 */
import { describe, expect, test } from "vitest";
import { getRelatedDocs, normalizeTags } from "../lib/related-docs";

const doc = (
  path: string,
  title: string,
  tags: string[] = [],
  docId?: string,
) => ({
  path,
  slugs: path.replace(/\.mdx?$/, "").split("/"),
  title,
  tags,
  docId,
});

describe("getRelatedDocs", () => {
  test("共享 tag 得分高于仅同目录", () => {
    const current = doc("learn/ai/rl/index.mdx", "强化学习", ["rl", "ai"]);
    const related = getRelatedDocs(current, [
      doc("learn/ai/rl/q-learning.mdx", "Q-Learning", ["misc"]),
      doc("learn/cs/algo/dp.mdx", "动态规划", ["rl"]),
    ]);
    expect(related[0].title).toBe("动态规划");
    expect(related[0].score).toBe(2);
    expect(related[1].title).toBe("Q-Learning");
    expect(related[1].score).toBe(1);
  });

  test("零得分不入选", () => {
    const current = doc("learn/ai/rl/index.mdx", "强化学习", ["rl"]);
    const related = getRelatedDocs(current, [
      doc("projects/town.mdx", "AI Town", ["agents"]),
    ]);
    expect(related).toHaveLength(0);
  });

  test("排除自身且按 docId 去重（翻译版不重复出现）", () => {
    const current = doc("a/x.mdx", "X", ["t"], "id-x");
    const related = getRelatedDocs(current, [
      doc("a/x.mdx", "X", ["t"], "id-x"),
      doc("a/y.mdx", "Y", ["t"], "id-y"),
      doc("a/y.en.mdx", "Y (en)", ["t"], "id-y"),
    ]);
    expect(related).toHaveLength(1);
    expect(related[0].title).toBe("Y");
  });

  test("上限截断且排序稳定", () => {
    const current = doc("d/cur.mdx", "cur", ["t"]);
    const cands = ["a", "b", "c", "d", "e"].map((n) =>
      doc(`d/${n}.mdx`, n, ["t"]),
    );
    const related = getRelatedDocs(current, cands, 4);
    expect(related).toHaveLength(4);
    expect(related.map((r) => r.title)).toEqual(["a", "b", "c", "d"]);
  });
});

describe("normalizeTags", () => {
  test("非数组与非字符串项安全降级", () => {
    expect(normalizeTags(undefined)).toEqual([]);
    expect(normalizeTags("rl")).toEqual([]);
    expect(normalizeTags(["RL", "  ai ", 3, ""])).toEqual(["rl", "ai"]);
  });
});
