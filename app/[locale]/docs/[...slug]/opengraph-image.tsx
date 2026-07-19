import { ImageResponse } from "next/og";
import { source } from "@/lib/source";
import { fetchSubsetFont } from "@/lib/og-font";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Involution Hell Docs";

interface Param {
  params: Promise<{ locale: string; slug?: string[] }>;
}

export default async function OgImage({ params }: Param) {
  const { locale, slug } = await params;
  const page = source.getPage(slug, locale);
  const title = page?.data.title ?? "Involution Hell";
  const section = (slug ?? []).slice(0, -1).join(" / ");
  const text = `${title}${section}Involution Hell 内卷地狱开源社区文档`;
  const font = await fetchSubsetFont(text);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background:
            "linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 60%, #16213e 100%)",
          color: "#fafafa",
          fontFamily: font ? "Noto Sans SC" : "sans-serif",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {section ? (
            <div style={{ display: "flex", fontSize: 28, color: "#a1a1aa" }}>
              {section}
            </div>
          ) : null}
          {font ? (
            <div
              style={{
                display: "flex",
                fontSize: title.length > 24 ? 56 : 72,
                fontWeight: 700,
                lineHeight: 1.25,
              }}
            >
              {title}
            </div>
          ) : null}
        </div>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            fontSize: 30,
          }}
        >
          <div style={{ display: "flex", color: "#e4e4e7" }}>
            {font ? "内卷地狱 · 开源社区文档" : "Involution Hell"}
          </div>
          <div style={{ display: "flex", color: "#818cf8" }}>
            involutionhell.com
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: font
        ? [{ name: "Noto Sans SC", data: font, weight: 700 as const }]
        : undefined,
    },
  );
}
