import { describe, expect, it } from "vitest";
import {
  hashText,
  normalizeForHash,
  segmentMdx,
  splitFrontmatter,
} from "@/lib/mdx-segment";

describe("splitFrontmatter", () => {
  it("separates the frontmatter block from the body", () => {
    const source = '---\ntitle: "你好"\ndocId: abc\n---\n\n# 标题\n正文\n';
    const { frontmatter, body } = splitFrontmatter(source);
    expect(frontmatter).toBe('---\ntitle: "你好"\ndocId: abc\n---');
    expect(body).toBe("\n# 标题\n正文\n");
  });

  it("returns empty frontmatter when the file has none", () => {
    const { frontmatter, body } = splitFrontmatter("# 标题\n正文\n");
    expect(frontmatter).toBe("");
    expect(body).toBe("# 标题\n正文\n");
  });

  it("does not treat a mid-document thematic break as a frontmatter fence", () => {
    const source = "intro\n\n---\n\nrest\n";
    const { frontmatter, body } = splitFrontmatter(source);
    expect(frontmatter).toBe("");
    expect(body).toBe(source);
  });
});

describe("segmentMdx", () => {
  it("splits on ATX headings, keeping preamble as a null-heading segment", () => {
    const source = "前言段落\n\n# 一级\n内容 A\n\n## 二级\n内容 B\n";
    const { segments } = segmentMdx(source);
    expect(segments.map((s) => s.heading)).toEqual([null, "一级", "二级"]);
    expect(segments.map((s) => s.depth)).toEqual([null, 1, 2]);
    expect(segments[0].content).toBe("前言段落\n");
    expect(segments[1].content).toBe("# 一级\n内容 A\n");
    expect(segments[2].content).toBe("## 二级\n内容 B\n");
  });

  it("reassembles losslessly by joining segment contents with \\n", () => {
    const source =
      "---\ntitle: t\n---\n\n开头\n\n# A\n\n```js\n# not a heading\n```\n\n## B\n结尾\n";
    const { frontmatter, segments } = segmentMdx(source);
    const rebuilt = `${frontmatter}\n${segments.map((s) => s.content).join("\n")}`;
    expect(rebuilt).toBe(source);
  });

  it("does not split on # lines inside backtick fences", () => {
    const source = "# 真标题\n```bash\n# 注释\n## 也是注释\n```\n尾部\n";
    const { segments } = segmentMdx(source);
    expect(segments).toHaveLength(1);
    expect(segments[0].content).toContain("# 注释");
  });

  it("does not split inside tilde fences or longer fences", () => {
    const source =
      "# H\n~~~\n# tilde 内\n~~~\n\n`````md\n# 五反引号内\n```\n# 仍在五反引号 fence 内\n`````\n后记\n";
    const { segments } = segmentMdx(source);
    expect(segments).toHaveLength(1);
  });

  it("requires a longer-or-equal closing fence of the same char", () => {
    const source = "# H\n````\n```\n# 还在 fence 里\n````\n## H2\n";
    const { segments } = segmentMdx(source);
    expect(segments.map((s) => s.heading)).toEqual(["H", "H2"]);
  });

  it("ignores setext headings (documented design choice)", () => {
    const source = "看起来像标题\n===\n\n真的正文\n";
    const { segments } = segmentMdx(source);
    expect(segments).toHaveLength(1);
    expect(segments[0].heading).toBeNull();
  });

  it("slugs CJK headings with the github slugger", () => {
    const { segments } = segmentMdx("# 项目概述\n\n## Hello World\n");
    expect(segments[0].headingSlug).toBe("项目概述");
    expect(segments[1].headingSlug).toBe("hello-world");
  });

  it("dedupes duplicate heading slugs with -1/-2 suffixes", () => {
    const { segments } = segmentMdx("# 概述\n\n## 概述\n\n### 概述\n");
    expect(segments.map((s) => s.headingSlug)).toEqual([
      "概述",
      "概述-1",
      "概述-2",
    ]);
  });

  it("strips ATX closing hashes from the heading text", () => {
    const { segments } = segmentMdx("## 标题 ##\n");
    expect(segments[0].heading).toBe("标题");
    expect(segments[0].content).toBe("## 标题 ##\n");
  });
});

describe("hashText", () => {
  it("is stable for identical content", () => {
    expect(hashText("# A\n内容\n")).toBe(hashText("# A\n内容\n"));
  });

  it("ignores trailing whitespace per line and trailing newlines", () => {
    expect(hashText("# A  \n内容\t\n\n\n")).toBe(hashText("# A\n内容"));
  });

  it("changes when the content changes", () => {
    expect(hashText("# A\n内容")).not.toBe(hashText("# A\n改了"));
  });

  it("does not collapse leading or internal whitespace", () => {
    expect(normalizeForHash("  indented\n\nkept")).toBe("  indented\n\nkept");
    expect(hashText("a\nb")).not.toBe(hashText("a\n\nb"));
  });
});
