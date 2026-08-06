import { describe, expect, test } from "vitest";
import {
  extractImageRefs,
  extractImageUrls,
  isRemoteUrl,
  isRelativePath,
  rewriteImageRefs,
  buildR2Key,
  dedupeFilename,
  contentTypeForExtension,
} from "../scripts/lib/image-refs.mjs";

describe("extractImageRefs / extractImageUrls", () => {
  test("提取 markdown 图片语法", () => {
    expect(extractImageUrls("前文 ![alt](./a.assets/x.png) 后文")).toEqual([
      "./a.assets/x.png",
    ]);
  });

  test("提取 HTML img（双引号 / 单引号 / 其他属性）", () => {
    const content = [
      `<img src="./b/one.jpg" alt="1" />`,
      `<img width="100" src='./b/two.webp'>`,
    ].join("\n");
    expect(extractImageUrls(content)).toEqual(["./b/one.jpg", "./b/two.webp"]);
  });

  test("kind 区分 markdown 与 html", () => {
    const content = `![a](./x.png)\n<img src="./y.png" />`;
    expect(extractImageRefs(content)).toEqual([
      { url: "./x.png", kind: "markdown" },
      { url: "./y.png", kind: "html" },
    ]);
  });

  test("同一 URL 多次出现只返回一次", () => {
    const content = `![a](./x.png) ![b](./x.png)\n<img src="./x.png" />`;
    expect(extractImageUrls(content)).toEqual(["./x.png"]);
  });

  test("同一行多个 markdown 图片都能提取", () => {
    expect(extractImageUrls("![a](./1.png) ![b](./2.png)")).toEqual([
      "./1.png",
      "./2.png",
    ]);
  });

  test("普通链接不被当成图片", () => {
    expect(
      extractImageUrls("[link](./doc.md) 与 <a href='./x.png'>x</a>"),
    ).toEqual([]);
  });
});

describe("isRemoteUrl / isRelativePath", () => {
  test.each([
    "https://example.com/x.png",
    "http://example.com/x.png",
    "HTTPS://example.com/x.png",
    "//cdn.example.com/x.png",
  ])("远程 URL：%s", (url) => {
    expect(isRemoteUrl(url)).toBe(true);
    expect(isRelativePath(url)).toBe(false);
  });

  test.each(["./a.assets/x.png", "../shared/x.png", "images/x.png"])(
    "相对路径：%s",
    (url) => {
      expect(isRemoteUrl(url)).toBe(false);
      expect(isRelativePath(url)).toBe(true);
    },
  );

  test.each(["/images/site/logo.png", "data:image/png;base64,abc"])(
    "既非远程也非相对：%s",
    (url) => {
      expect(isRemoteUrl(url)).toBe(false);
      expect(isRelativePath(url)).toBe(false);
    },
  );
});

describe("buildR2Key", () => {
  test("key 为 docs/<docId>/<filename>", () => {
    expect(buildR2Key("abc123", "diagram.png")).toBe("docs/abc123/diagram.png");
  });
});

describe("dedupeFilename", () => {
  test("无冲突时原样返回", () => {
    expect(dedupeFilename("x.png", new Set())).toBe("x.png");
  });

  test("冲突时在扩展名前追加 -1 / -2", () => {
    const used = new Set(["x.png"]);
    const first = dedupeFilename("x.png", used);
    expect(first).toBe("x-1.png");
    used.add(first);
    expect(dedupeFilename("x.png", used)).toBe("x-2.png");
  });

  test("已有 -1 后缀被占用时继续递增", () => {
    expect(dedupeFilename("x.png", new Set(["x.png", "x-1.png"]))).toBe(
      "x-2.png",
    );
  });
});

describe("rewriteImageRefs", () => {
  test("改写 markdown 与 html 引用，未映射的保留", () => {
    const content = `![a](./x.png)\n<img src="./y.png" />\n![c](./z.png)`;
    const out = rewriteImageRefs(
      content,
      new Map([
        ["./x.png", "https://cdn.example.com/docs/id/x.png"],
        ["./y.png", "https://cdn.example.com/docs/id/y.png"],
      ]),
    );
    expect(out).toBe(
      `![a](https://cdn.example.com/docs/id/x.png)\n<img src="https://cdn.example.com/docs/id/y.png" />\n![c](./z.png)`,
    );
  });

  test("图片语法之外恰好相同的文本不被改写", () => {
    const content = "路径 ./x.png 见下图\n![a](./x.png)";
    const out = rewriteImageRefs(content, new Map([["./x.png", "NEW"]]));
    expect(out).toBe("路径 ./x.png 见下图\n![a](NEW)");
  });
});

describe("contentTypeForExtension", () => {
  test.each([
    [".png", "image/png"],
    [".jpg", "image/jpeg"],
    [".JPEG", "image/jpeg"],
    [".webp", "image/webp"],
    [".svg", "image/svg+xml"],
  ])("%s -> %s", (ext, mime) => {
    expect(contentTypeForExtension(ext)).toBe(mime);
  });

  test("未知扩展名兜底 octet-stream", () => {
    expect(contentTypeForExtension(".bin")).toBe("application/octet-stream");
  });
});
