import { getTranslations } from "next-intl/server";
import { Languages } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TranslationStatus } from "@/lib/translation-status";

interface TranslationNoticeProps {
  status: TranslationStatus;
  /** 文档 slug 路径（不含 locale / /docs 前缀），如 "learn/ai/gpt" */
  slugPath: string;
  className?: string;
}

/**
 * 机翻/缺译标注横幅（纯 server component，不碰动态 API，SSG 安全）。
 *
 * 机翻标注不是 UX 装饰而是合规义务：CC BY-NC-SA 4.0 §3(a)(1)(B) 要求
 * 演绎作品"标明修改"；《人工智能生成合成内容标识办法》（2025-09 起施行）
 * 要求公开传播的 AI 生成文本带显式标识。数据源是翻译管线写入的
 * frontmatter（translatedFrom / translatorAgent）。
 */
export async function TranslationNotice({
  status,
  slugPath,
  className,
}: TranslationNoticeProps) {
  if (status.kind === "original") return null;
  const t = await getTranslations("translationNotice");

  const base = cn(
    "flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-muted/50 px-4 py-3 text-sm text-muted-foreground",
    className,
  );

  if (status.kind === "fallback") {
    const zhHref = slugPath ? `/zh/docs/${slugPath}` : "/zh/docs";
    return (
      <div className={base} data-translation-status="fallback">
        <Languages className="h-4 w-4 shrink-0" aria-hidden />
        <span>{t("fallback")}</span>
        <a href={zhHref} className="underline underline-offset-2">
          {t("readOriginal")}
        </a>
      </div>
    );
  }

  const sourceLabel =
    status.translatedFrom === "zh" ? t("sourceZh") : t("sourceEn");
  const originalHref = slugPath
    ? `/${status.translatedFrom}/docs/${slugPath}`
    : `/${status.translatedFrom}/docs`;

  return (
    <div className={base} data-translation-status="machine-translated">
      <Languages className="h-4 w-4 shrink-0" aria-hidden />
      <span>{t("machine", { source: sourceLabel })}</span>
      <a href={originalHref} className="underline underline-offset-2">
        {t("readOriginal")}
      </a>
      <span className="opacity-70">{t("license")}</span>
    </div>
  );
}
