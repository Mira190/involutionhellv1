import { describe, expect, it } from "vitest";
import type { PageTree } from "fumadocs-core/server";
import { extractTopLevelSections } from "@/lib/classify-sections";

function page(url: string): PageTree.Node {
  return { type: "page", name: url, url };
}

describe("extractTopLevelSections", () => {
  it("extracts top-level folder slugs from index urls", () => {
    const tree: PageTree.Root = {
      name: "docs",
      children: [
        {
          type: "folder",
          name: "职业发展",
          index: { type: "page", name: "career", url: "/docs/career" },
          children: [page("/docs/career/interview-prep/foo")],
        },
        {
          type: "folder",
          name: "学习路线",
          index: { type: "page", name: "learn", url: "/docs/learn" },
          children: [],
        },
      ],
    };
    expect(extractTopLevelSections(tree)).toEqual([
      { slug: "career", name: "职业发展" },
      { slug: "learn", name: "学习路线" },
    ]);
  });

  it("falls back to the first descendant page url when folder has no index", () => {
    const tree: PageTree.Root = {
      name: "docs",
      children: [
        {
          type: "folder",
          name: "projects",
          children: [
            {
              type: "folder",
              name: "sub",
              children: [page("/docs/projects/sub/first")],
            },
          ],
        },
      ],
    };
    expect(extractTopLevelSections(tree)).toEqual([
      { slug: "projects", name: "projects" },
    ]);
  });

  it("skips separators, top-level pages, and empty folders", () => {
    const tree: PageTree.Root = {
      name: "docs",
      children: [
        { type: "separator", name: "---" },
        page("/docs"),
        { type: "folder", name: "empty", children: [] },
        {
          type: "folder",
          name: "learn",
          index: { type: "page", name: "learn", url: "/docs/learn" },
          children: [],
        },
      ],
    };
    expect(extractTopLevelSections(tree)).toEqual([
      { slug: "learn", name: "learn" },
    ]);
  });
});
