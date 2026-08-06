const FONT_CSS_URL =
  "https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@700";

const cache = new Map<string, Promise<ArrayBuffer | null>>();

/**
 * 按需子集化：css2 的 text= 参数让 Google Fonts 只返回覆盖给定字符的
 * truetype 子集（几 KB），避免把整套 CJK 字体（>10MB）打进 OG 渲染。
 * 仅在 build/SSG 阶段执行；失败返回 null，调用方降级为无文字卡片，
 * 绝不能 throw——单页字体拉取失败不应该弄挂整次 build。
 */
export function fetchSubsetFont(text: string): Promise<ArrayBuffer | null> {
  const key = Array.from(new Set(text)).sort().join("");
  const hit = cache.get(key);
  if (hit) return hit;

  const task = (async () => {
    try {
      const cssRes = await fetch(
        `${FONT_CSS_URL}&text=${encodeURIComponent(key)}`,
        { headers: { "User-Agent": "Mozilla/5.0" } },
      );
      if (!cssRes.ok) return null;
      const css = await cssRes.text();
      const url = css.match(
        /src:\s*url\(([^)]+)\)\s*format\('truetype'\)/,
      )?.[1];
      if (!url) return null;
      const fontRes = await fetch(url);
      if (!fontRes.ok) return null;
      return await fontRes.arrayBuffer();
    } catch {
      return null;
    }
  })();

  cache.set(key, task);
  return task;
}
