import { describe, expect, it } from "vitest";
import {
  processDoc,
  protectPlaceholders,
  restorePlaceholders,
  serializeTm,
  translateUnit,
  verifyPlaceholders,
} from "../scripts/lib/translate-core.mjs";
import { createMockProvider } from "../scripts/lib/translate-provider.mjs";

const FIXED_NOW = () => "2026-07-19T00:00:00.000Z";

const SOURCE = `---
title: "测试文档"
description: "这是一个测试文档的描述。"
date: "2026-01-01"
tags:
  - testing
docId: doc-test-1
---

开头段落，介绍 https://example.com/docs 的用法。

# 概述

这里讲 <Callout type="info">组件</Callout> 与 \`inline_code\` 的关系。

## 代码示例

先看数学 $E = mc^2$ 的公式：

\`\`\`python
# 这行注释不该被翻译
print("你好")
\`\`\`

## 结语

import { Widget } from "widgets";

最后一段。
`;

function emptyTm() {
  return { version: 1, entries: {} };
}

async function freshTranslate(sourceRaw = SOURCE) {
  const tm = emptyTm();
  const provider = createMockProvider();
  const result = await processDoc({
    sourceRaw,
    targetRaw: null,
    docId: "doc-test-1",
    sourcePath: "content/docs/test.mdx",
    tm,
    provider,
    mode: "apply",
    now: FIXED_NOW,
  });
  return {
    result,
    tm: { version: 1, entries: { "doc-test-1": result.tmDoc } },
  };
}

describe("placeholder protection", () => {
  it("masks fences, inline code, math, URLs, tags and import lines", () => {
    const { masked, tokens } = protectPlaceholders(
      '看 <Tag a="1">x</Tag> 与 `code` 与 $x+y$ 与 https://a.io/b\n```\n# fence\n```\nimport x from "y";\n$$\na=b\n$$',
    );
    expect(masked).not.toContain("fence");
    expect(masked).not.toContain("import");
    expect(masked).not.toContain("code");
    expect(masked).not.toContain("x+y");
    expect(masked).not.toContain("https://");
    expect(masked).not.toContain("<Tag");
    expect(masked).not.toContain("a=b");
    expect(tokens.length).toBeGreaterThanOrEqual(7);
    const restored = restorePlaceholders(masked, tokens);
    expect(restored).toContain("# fence");
    expect(restored).toContain('import x from "y";');
  });

  it("verifyPlaceholders flags missing, unexpected and duplicated tokens", () => {
    const tokens = [
      { token: "⟦PH0⟧", original: "a" },
      { token: "⟦PH1⟧", original: "b" },
    ];
    expect(verifyPlaceholders("⟦PH0⟧ ⟦PH1⟧", tokens).ok).toBe(true);
    expect(verifyPlaceholders("⟦PH0⟧", tokens).missing).toEqual(["⟦PH1⟧"]);
    expect(verifyPlaceholders("⟦PH0⟧ ⟦PH1⟧ ⟦PH9⟧", tokens).unexpected).toEqual([
      "⟦PH9⟧",
    ]);
    expect(verifyPlaceholders("⟦PH0⟧ ⟦PH0⟧ ⟦PH1⟧", tokens).duplicated).toEqual([
      "⟦PH0⟧",
    ]);
  });

  it("skips the provider entirely for units with no translatable text", async () => {
    const text = "```js\nconst a = 1;\n```";
    let calls = 0;
    const provider = {
      model: "spy",
      translate: async () => {
        calls++;
        return "";
      },
    };
    const result = await translateUnit(text, provider);
    expect(result.text).toBe(text);
    expect(result.providerCalls).toBe(0);
    expect(calls).toBe(0);
  });
});

describe("processDoc — fresh translate", () => {
  it("translates every unit, protects code, and records TM entries", async () => {
    const { result } = await freshTranslate();
    expect(result.stats.skipped).toBe(false);
    expect(result.conflicts).toEqual([]);
    // 2 frontmatter units + 5 body segments (preamble + 4 headings... preamble + 概述 + 代码示例 + 结语)
    expect(result.stats.units).toBe(6);
    expect(result.stats.translated).toBe(6);
    expect(result.stats.reused).toBe(0);

    const out = result.output!;
    expect(out).toContain('title: "[en] 测试文档"');
    expect(out).toContain('description: "[en] 这是一个测试文档的描述。"');
    expect(out).toContain("lang: en");
    expect(out).toContain("translatedFrom: zh");
    expect(out).toContain('sourcePath: "content/docs/test.mdx"');
    expect(out).toContain('translatorAgent: "mock-translator"');
    expect(out).toMatch(/sourceHash: [0-9a-f]{64}/);
    expect(out).not.toContain("translatedAt");
    // protected content survives byte-for-byte
    expect(out).toContain("# 这行注释不该被翻译");
    expect(out).toContain('print("你好")');
    expect(out).toContain("`inline_code`");
    expect(out).toContain("$E = mc^2$");
    expect(out).toContain("https://example.com/docs");
    expect(out).toContain('import { Widget } from "widgets";');
    expect(out).toContain('<Callout type="info">');
    // translated prose is marked by the mock
    expect(out).toContain("## [en] 结语");
    expect(Object.keys(result.tmDoc)).toHaveLength(6);
    for (const entry of Object.values(result.tmDoc)) {
      expect(entry.model).toBe("mock-translator");
      expect(entry.at).toBe(FIXED_NOW());
    }
  });

  it("plan mode reports the same counts without calling the provider", async () => {
    let calls = 0;
    const provider = {
      model: "spy",
      translate: async () => {
        calls++;
        return "";
      },
    };
    const result = await processDoc({
      sourceRaw: SOURCE,
      targetRaw: null,
      docId: "doc-test-1",
      sourcePath: "content/docs/test.mdx",
      tm: emptyTm(),
      provider,
      mode: "plan",
      now: FIXED_NOW,
    });
    expect(result.output).toBeNull();
    expect(result.stats.translated).toBe(6);
    expect(result.stats.providerCalls).toBe(0);
    expect(calls).toBe(0);
  });
});

describe("processDoc — incremental", () => {
  it("retranslates only the changed segment; the rest are TM hits", async () => {
    const { result: first, tm } = await freshTranslate();
    const changedSource = SOURCE.replace("最后一段。", "最后一段，改过了。");
    const provider = createMockProvider();
    const second = await processDoc({
      sourceRaw: changedSource,
      targetRaw: first.output,
      docId: "doc-test-1",
      sourcePath: "content/docs/test.mdx",
      tm,
      provider,
      mode: "apply",
      now: FIXED_NOW,
    });
    expect(second.stats.translated).toBe(1);
    expect(second.stats.reused).toBe(5);
    expect(second.stats.conflicts).toBe(0);
    expect(second.output).toContain("[en] 最后一段，改过了。");
    expect(second.output).toContain("# [en] 概述");
  });
});

describe("processDoc — three-way protection", () => {
  it("adopts a human edit into the TM when the source is unchanged", async () => {
    const { result: first, tm } = await freshTranslate();
    const humanTarget = first.output!.replace(
      "[en] 最后一段。",
      "A hand-polished final paragraph.",
    );
    const second = await processDoc({
      sourceRaw: SOURCE,
      targetRaw: humanTarget,
      docId: "doc-test-1",
      sourcePath: "content/docs/test.mdx",
      tm,
      provider: createMockProvider(),
      mode: "apply",
      now: FIXED_NOW,
    });
    expect(second.stats.adoptedEdits).toBe(1);
    expect(second.stats.reused).toBe(5);
    expect(second.stats.conflicts).toBe(0);
    expect(second.output).toContain("A hand-polished final paragraph.");
    const humanEntries = Object.values(second.tmDoc).filter(
      (entry) => entry.model === "human",
    );
    expect(humanEntries).toHaveLength(1);
    expect(humanEntries[0].target).toContain(
      "A hand-polished final paragraph.",
    );
  });

  it("records a conflict and keeps the human text when source AND target changed", async () => {
    const { result: first, tm } = await freshTranslate();
    const humanTarget = first.output!.replace(
      "[en] 最后一段。",
      "A hand-polished final paragraph.",
    );
    const changedSource = SOURCE.replace("最后一段。", "最后一段，改过了。");
    const second = await processDoc({
      sourceRaw: changedSource,
      targetRaw: humanTarget,
      docId: "doc-test-1",
      sourcePath: "content/docs/test.mdx",
      tm,
      provider: createMockProvider(),
      mode: "apply",
      now: FIXED_NOW,
    });
    expect(second.stats.conflicts).toBe(1);
    expect(second.stats.translated).toBe(0);
    expect(second.conflicts).toHaveLength(1);
    expect(second.conflicts[0].docId).toBe("doc-test-1");
    expect(second.conflicts[0].heading).toBe("结语");
    expect(second.output).toContain("A hand-polished final paragraph.");
    expect(second.output).not.toContain("最后一段，改过了。");
    // the conflicted segment gets no TM entry under the new source hash
    expect(Object.keys(second.tmDoc)).toHaveLength(5);
  });

  it("bootstrap-adopts an existing .en file when the TM is empty", async () => {
    const { result: first } = await freshTranslate();
    const second = await processDoc({
      sourceRaw: SOURCE,
      targetRaw: first.output,
      docId: "doc-test-1",
      sourcePath: "content/docs/test.mdx",
      tm: emptyTm(),
      mode: "apply",
      model: "mock-translator",
      now: FIXED_NOW,
    });
    expect(second.stats.adopted).toBe(6);
    expect(second.stats.translated).toBe(0);
    expect(second.stats.providerCalls).toBe(0);
    expect(second.output).toBe(first.output);
    for (const entry of Object.values(second.tmDoc)) {
      expect(entry.model).toBe("adopted");
    }
  });

  it("skips the whole doc with a conflict when segments cannot be aligned", async () => {
    const { result: first, tm } = await freshTranslate();
    const humanTarget = `${first.output}\n## Extra human section\n\nHand-written.\n`;
    const changedSource = SOURCE.replace("最后一段。", "改动。");
    const second = await processDoc({
      sourceRaw: changedSource,
      targetRaw: humanTarget,
      docId: "doc-test-1",
      sourcePath: "content/docs/test.mdx",
      tm,
      provider: createMockProvider(),
      mode: "apply",
      now: FIXED_NOW,
    });
    expect(second.stats.skipped).toBe(true);
    expect(second.output).toBeNull();
    expect(second.conflicts).toHaveLength(1);
    expect(second.conflicts[0].heading).toBe("(document)");
  });
});

describe("processDoc — adopt mode", () => {
  it("adopts an existing .en file into the TM without provider or file output", async () => {
    const { result: first } = await freshTranslate();
    const result = await processDoc({
      sourceRaw: SOURCE,
      targetRaw: first.output,
      docId: "doc-test-1",
      sourcePath: "content/docs/test.mdx",
      tm: emptyTm(),
      mode: "adopt",
      now: FIXED_NOW,
    });
    expect(result.output).toBeNull();
    expect(result.stats.adopted).toBe(6);
    expect(result.stats.translated).toBe(0);
    expect(result.stats.providerCalls).toBe(0);
    expect(Object.keys(result.tmDoc)).toHaveLength(6);
    for (const entry of Object.values(result.tmDoc)) {
      expect(entry.model).toBe("adopted");
    }
  });

  it("leaves provider-needed units pending without a provider", async () => {
    const result = await processDoc({
      sourceRaw: SOURCE,
      targetRaw: null,
      docId: "doc-test-1",
      sourcePath: "content/docs/test.mdx",
      tm: emptyTm(),
      mode: "adopt",
      now: FIXED_NOW,
    });
    expect(result.output).toBeNull();
    expect(result.stats.translated).toBe(6);
    expect(result.stats.providerCalls).toBe(0);
    expect(Object.keys(result.tmDoc)).toHaveLength(0);
  });

  it("is idempotent: a second adopt run reuses every unit and keeps entries byte-identical", async () => {
    const { result: first } = await freshTranslate();
    const one = await processDoc({
      sourceRaw: SOURCE,
      targetRaw: first.output,
      docId: "doc-test-1",
      sourcePath: "content/docs/test.mdx",
      tm: emptyTm(),
      mode: "adopt",
      now: FIXED_NOW,
    });
    const tm = { version: 1, entries: { "doc-test-1": one.tmDoc } };
    const two = await processDoc({
      sourceRaw: SOURCE,
      targetRaw: first.output,
      docId: "doc-test-1",
      sourcePath: "content/docs/test.mdx",
      tm,
      mode: "adopt",
      now: () => "2099-01-01T00:00:00.000Z",
    });
    expect(two.stats.reused).toBe(6);
    expect(two.stats.adopted).toBe(0);
    expect(
      serializeTm({ version: 1, entries: { "doc-test-1": two.tmDoc } }),
    ).toBe(serializeTm({ version: 1, entries: { "doc-test-1": one.tmDoc } }));
  });
});

describe("processDoc — placeholder mismatch", () => {
  it("keeps the source segment untranslated and records a conflict after a failed retry", async () => {
    const provider = createMockProvider({ dropPlaceholders: Infinity });
    const result = await processDoc({
      sourceRaw: SOURCE,
      targetRaw: null,
      docId: "doc-test-1",
      sourcePath: "content/docs/test.mdx",
      tm: emptyTm(),
      provider,
      mode: "apply",
      now: FIXED_NOW,
    });
    // units with placeholders fail twice each and fall back to the source text
    expect(result.stats.conflicts).toBeGreaterThan(0);
    expect(
      result.conflicts.every((c) => c.reason.includes("placeholder mismatch")),
    ).toBe(true);
    // failed segments keep the untranslated source text
    expect(result.output).toContain("这里讲 <Callout");
    // units without placeholders still translate fine
    expect(result.output).toContain('title: "[en] 测试文档"');
    // no TM entry for failed units
    const conflictedCount = result.conflicts.length;
    expect(Object.keys(result.tmDoc)).toHaveLength(6 - conflictedCount);
  });
});

describe("serializeTm", () => {
  it("serializes deterministically with sorted keys", () => {
    const a = serializeTm({
      version: 1,
      entries: {
        b: { h2: { target: "y", targetHash: "t2", model: "m", at: "1" } },
        a: {
          zz: { target: "x", targetHash: "t1", model: "m", at: "1" },
          aa: { target: "w", targetHash: "t0", model: "m", at: "1" },
        },
      },
    });
    const b = serializeTm({
      version: 1,
      entries: {
        a: {
          aa: { target: "w", targetHash: "t0", model: "m", at: "1" },
          zz: { target: "x", targetHash: "t1", model: "m", at: "1" },
        },
        b: { h2: { target: "y", targetHash: "t2", model: "m", at: "1" } },
      },
    });
    expect(a).toBe(b);
    expect(a.indexOf('"a"')).toBeLessThan(a.indexOf('"b"'));
    expect(a.endsWith("\n")).toBe(true);
  });
});
