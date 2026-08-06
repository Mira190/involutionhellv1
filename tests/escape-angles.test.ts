/**
 * escapeSuspiciousAngles 单元测试。
 *
 * 该函数在 prebuild 阶段改写 content/ 下的 markdown：转义会撞 MDX 编译的
 * "可疑尖括号"（<8>、<x, y>），同时必须放过真实 HTML/JSX 标签与代码块。
 * 误伤 = 内容悄悄变形；漏转 = build 挂。两侧都要锁。
 */
import { describe, expect, test } from "vitest";
import { escapeSuspiciousAngles } from "../lib/escape-angles";

describe("escapeSuspiciousAngles", () => {
  test("数字开头的尖括号被转义", () => {
    expect(escapeSuspiciousAngles("范围是 <8> 以内")).toBe(
      "范围是 &lt;8&gt; 以内",
    );
    expect(escapeSuspiciousAngles("<1,2,3>")).toBe("&lt;1,2,3&gt;");
  });

  test("含逗号/空格等非标签符号的尖括号被转义", () => {
    expect(escapeSuspiciousAngles("泛型 <x, y> 参数")).toContain(
      "&lt;x, y&gt;",
    );
  });

  test("真实 HTML 标签不动（含属性与自闭合）", () => {
    const src =
      '<div>x</div> <br /> <img src="a.png" alt="p" /> <a href="x" title="y">t</a>';
    expect(escapeSuspiciousAngles(src)).toBe(src);
  });

  test("JSX 组件标签不动", () => {
    const src = '<Component prop="val" /> 与 <Cards>内容</Cards>';
    expect(escapeSuspiciousAngles(src)).toBe(src);
  });

  test("fenced code block 内一律不动", () => {
    const src = "```cpp\nvector<int> v; if (a<8) {}\n```\n";
    expect(escapeSuspiciousAngles(src)).toBe(src);
  });

  test("inline code 内一律不动", () => {
    const src = "用 `vector<int>` 和 `a<8`";
    expect(escapeSuspiciousAngles(src)).toBe(src);
  });

  test("对合法标签幂等：跑两次等于跑一次", () => {
    const src = "<div>x</div> 范围 <8> `code<1>`";
    const once = escapeSuspiciousAngles(src);
    expect(escapeSuspiciousAngles(once)).toBe(once);
  });
});
