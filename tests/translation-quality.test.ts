import { describe, expect, it } from "vitest";
import {
  checkTranslationPair,
  langFromPath,
  type QualityFinding,
} from "@/lib/translation-quality";

const SOURCE = `---
title: "测试文档"
description: "描述。"
docId: doc-test-1
---

开头段落，铺垫一下背景，说明这篇文档要解决的问题和适用范围。

## 概述

这里是概述内容，讲清楚整体结构，前后呼应，方便读者快速定位到需要的小节。

## 代码示例

先看示例：

\`\`\`python
# 注释保持原样
print("你好")
\`\`\`

## 结语

最后一段，总结全文要点，并给出进一步阅读的建议与相关资料的入口。
`;

const TARGET = `---
title: "Test Doc"
description: "Description."
docId: doc-test-1
lang: en
translatedFrom: zh
---

An opening paragraph laying out the background, the problem this document solves, and its scope.

## Overview

This is the overview. It explains the overall structure so readers can quickly find the section they need.

## Code Example

Look at the example first:

\`\`\`python
# 注释保持原样
print("你好")
\`\`\`

## Conclusion

A final paragraph that summarizes the key points and offers pointers to further reading and related material.
`;

function check(
  sourceRaw: string,
  targetRaw: string,
  docExists?: (p: string) => boolean,
): QualityFinding[] {
  return checkTranslationPair({
    sourcePath: "content/docs/test.mdx",
    targetPath: "content/docs/test.en.mdx",
    sourceRaw,
    targetRaw,
    docExists,
  });
}

function rules(findings: QualityFinding[]): string[] {
  return findings.map((f) => f.rule);
}

describe("langFromPath", () => {
  it("maps suffixes to languages", () => {
    expect(langFromPath("content/docs/a.en.mdx")).toBe("en");
    expect(langFromPath("content/docs/a.zh.md")).toBe("zh");
    expect(langFromPath("content/docs/a.mdx")).toBe("zh");
  });
});

describe("clean pair", () => {
  it("produces zero findings", () => {
    expect(check(SOURCE, TARGET)).toEqual([]);
  });
});

describe("heading parity", () => {
  it("detects a dropped section", () => {
    const dropped = TARGET.replace(/## Conclusion[\s\S]*$/, "");
    const findings = check(SOURCE, dropped);
    const parity = findings.filter((f) => f.rule === "heading-parity");
    expect(parity).toHaveLength(1);
    expect(parity[0].severity).toBe("error");
    expect(parity[0].message).toContain("source has 3 headings");
    expect(parity[0].message).toContain("结语");
  });

  it("detects a depth change", () => {
    const demoted = TARGET.replace("## Conclusion", "### Conclusion");
    const findings = check(SOURCE, demoted);
    expect(rules(findings)).toContain("heading-parity");
  });
});

describe("fence integrity", () => {
  it("detects a translated fence body", () => {
    const translatedFence = TARGET.replace(
      '# 注释保持原样\nprint("你好")',
      '# comment translated\nprint("hello")',
    );
    const findings = check(SOURCE, translatedFence);
    const fence = findings.filter((f) => f.rule === "fence-integrity");
    expect(fence).toHaveLength(1);
    expect(fence[0].severity).toBe("error");
    expect(fence[0].message).toContain("executable code differs");
  });

  it("detects a dropped fence via count mismatch", () => {
    const noFence = TARGET.replace(
      /```python[\s\S]*?```\n/,
      "The code block was lost in translation.\n",
    );
    const findings = check(SOURCE, noFence);
    expect(rules(findings)).toContain("fence-integrity");
    expect(
      findings.find((f) => f.rule === "fence-integrity")!.message,
    ).toContain("count mismatch");
  });

  it("detects an info string mismatch", () => {
    const wrongInfo = TARGET.replace("```python", "```py");
    const findings = check(SOURCE, wrongInfo);
    expect(
      findings.find((f) => f.rule === "fence-integrity")!.message,
    ).toContain("info string mismatch");
  });
});

describe("fence integrity — 按语言分级", () => {
  it("可执行 fence 仅注释不同 → info 而非 error", () => {
    const commentOnly = TARGET.replace("# 注释保持原样", "# comment translated");
    const fence = check(SOURCE, commentOnly).filter(
      (f) => f.rule === "fence-integrity",
    );
    expect(fence).toHaveLength(1);
    expect(fence[0].severity).toBe("info");
    expect(fence[0].message).toContain("translated-comments");
  });

  it("含 CJK 的尖括号占位符被翻译 → 放行", () => {
    const src = SOURCE.replace(
      'print("你好")',
      '$ mv /home/<你的用户名>/a /b',
    ).replace("```python", "```sh");
    const tgt = TARGET.replace(
      'print("你好")',
      "$ mv /home/<your-username>/a /b",
    ).replace("```python", "```sh");
    const fence = check(src, tgt).filter((f) => f.rule === "fence-integrity");
    expect(fence).toHaveLength(1);
    expect(fence[0].severity).toBe("info");
  });

  it("纯 ASCII 尖括号（真代码）被改动 → 仍报 error", () => {
    const src = SOURCE.replace(
      'print("你好")',
      "#include <vector>",
    ).replace("```python", "```cpp");
    const tgt = TARGET.replace(
      'print("你好")',
      "#include <向量>",
    ).replace("```python", "```cpp");
    const fence = check(src, tgt).filter((f) => f.rule === "fence-integrity");
    expect(fence).toHaveLength(1);
    expect(fence[0].severity).toBe("error");
  });

  it("非可执行 fence（json 示意）内容翻译 → 放行", () => {
    const src = SOURCE.replace(
      'print("你好")',
      'content: <完整上下文>',
    ).replace("```python", "```json");
    const tgt = TARGET.replace(
      'print("你好")',
      "content: <full context>",
    ).replace("```python", "```json");
    const fence = check(src, tgt).filter((f) => f.rule === "fence-integrity");
    expect(fence).toHaveLength(0);
  });

  it("unicode 转义与字面量等价 → 放行", () => {
    const tgt = TARGET.replace('print("你好")', 'print("\\u4f60\\u597d")');
    const src = SOURCE.replace("# 注释保持原样", "# 注释保持原样");
    const fence = check(src, tgt).filter((f) => f.rule === "fence-integrity");
    expect(fence.filter((f) => f.severity === "error")).toHaveLength(0);
  });
});

describe("internal links", () => {
  it("detects an anchor link to a renamed heading", () => {
    const withLink = TARGET.replace(
      "Look at the example first:",
      "See the [overview](#overview-of-everything) first:",
    );
    const findings = check(SOURCE, withLink);
    const link = findings.filter((f) => f.rule === "internal-link");
    expect(link).toHaveLength(1);
    expect(link[0].message).toContain("#overview-of-everything");
  });

  it("accepts an anchor that matches a real heading slug", () => {
    const withLink = TARGET.replace(
      "Look at the example first:",
      "See the [overview](#overview) first:",
    );
    expect(check(SOURCE, withLink)).toEqual([]);
  });

  it("checks /docs/ and relative doc links against the corpus", () => {
    const withLinks = TARGET.replace(
      "Look at the example first:",
      "See [a](/docs/projects/real) and [b](./missing.md) and [img](./pic.png):",
    );
    const exists = (p: string) => p === "content/docs/projects/real.mdx";
    const findings = check(SOURCE, withLinks, exists);
    const link = findings.filter((f) => f.rule === "internal-link");
    expect(link).toHaveLength(1);
    expect(link[0].message).toContain("./missing.md");
  });

  it("skips file-existence checks when no docExists is provided", () => {
    const withLinks = TARGET.replace(
      "Look at the example first:",
      "See [b](./missing.md):",
    );
    expect(check(SOURCE, withLinks)).toEqual([]);
  });
});

describe("residual CJK", () => {
  it("detects CJK outside fences and reports offending lines", () => {
    const withCjk = TARGET.replace(
      "This is the overview.",
      "This is the 概述 of the document.",
    );
    const findings = check(SOURCE, withCjk);
    const cjk = findings.filter((f) => f.rule === "residual-cjk");
    expect(cjk).toHaveLength(1);
    expect(cjk[0].severity).toBe("error");
    expect(cjk[0].message).toContain("2 CJK");
    expect(cjk[0].message).toContain("line ");
  });

  it("ignores CJK inside fences and inline code", () => {
    const withInline = TARGET.replace(
      "Look at the example first:",
      "Run `打印()` as shown:",
    );
    expect(check(SOURCE, withInline)).toEqual([]);
  });

  it("honors the allowCjk frontmatter opt-out", () => {
    const withCjk = TARGET.replace(
      "This is the overview.",
      "This is the 概述 of the document.",
    ).replace("lang: en", "lang: en\nallowCjk: true");
    expect(check(SOURCE, withCjk)).toEqual([]);
  });
});

describe("frontmatter", () => {
  it("detects a docId mismatch", () => {
    const wrongId = TARGET.replace(
      "docId: doc-test-1",
      "docId: doc-test-OTHER",
    );
    const findings = check(SOURCE, wrongId);
    const fm = findings.filter((f) => f.rule === "frontmatter");
    expect(fm).toHaveLength(1);
    expect(fm[0].message).toContain("docId mismatch");
  });

  it("detects missing lang and translatedFrom", () => {
    const stripped = TARGET.replace("lang: en\ntranslatedFrom: zh\n", "");
    const findings = check(SOURCE, stripped);
    const fm = findings.filter((f) => f.rule === "frontmatter");
    expect(fm).toHaveLength(2);
    expect(fm.map((f) => f.message).join(" ")).toContain('lang should be "en"');
    expect(fm.map((f) => f.message).join(" ")).toContain(
      'translatedFrom should be "zh"',
    );
  });
});

describe("length ratio", () => {
  it("flags a grossly truncated segment but not a normal 2x one", () => {
    const truncated = TARGET.replace(
      /## Conclusion\n\nA final paragraph[\s\S]*?\n$/,
      "## Conclusion\n\nEnd.\n",
    );
    const findings = check(SOURCE, truncated);
    const ratio = findings.filter((f) => f.rule === "length-ratio");
    expect(ratio).toHaveLength(1);
    expect(ratio[0].severity).toBe("warning");
    expect(ratio[0].message).toContain("结语");
  });

  it("does not flag a ~2x expansion (normal for zh→en)", () => {
    expect(
      check(SOURCE, TARGET).filter((f) => f.rule === "length-ratio"),
    ).toEqual([]);
  });

  it("only applies to zh→en pairs", () => {
    const zhTarget = SOURCE.replace(
      "docId: doc-test-1",
      "docId: doc-test-1\nlang: zh\ntranslatedFrom: en",
    );
    const findings = checkTranslationPair({
      sourcePath: "content/docs/test.en.mdx",
      targetPath: "content/docs/test.zh.mdx",
      sourceRaw: TARGET,
      targetRaw: zhTarget,
    });
    expect(findings).toEqual([]);
  });
});

describe("segment count", () => {
  it("warns when only preamble presence differs", () => {
    const noPreamble = TARGET.replace(
      "---\n\nAn opening paragraph laying out the background, the problem this document solves, and its scope.\n\n## Overview",
      "---\n## Overview",
    );
    const findings = check(SOURCE, noPreamble);
    const seg = findings.filter((f) => f.rule === "segment-count");
    expect(seg).toHaveLength(1);
    expect(seg[0].severity).toBe("warning");
  });
});
