export const TRANSLATION_SYNC_MARKER = "[translation-sync]";

export interface TranslationCommitCreditInput {
  isCreation: boolean;
  authorLogin?: string | null;
  authorName?: string | null;
  subject: string;
}

// MOCK: 翻译文件（frontmatter 带 translatedFrom）的贡献计数规则按模拟签核实
// 现，尚未经维护者批准。批准前语义可能调整，不要在其他调用方依赖此规则。
// 规则：创建 commit（机器批量导入）不计；bot 作者不计；带 [translation-sync]
// 标记的流水线 commit 不计；其余人工修复计入。
export function shouldCountTranslationCommit({
  isCreation,
  authorLogin,
  authorName,
  subject,
}: TranslationCommitCreditInput): boolean {
  if (isCreation) return false;
  if ((authorLogin ?? "").includes("[bot]")) return false;
  if ((authorName ?? "").includes("[bot]")) return false;
  if (subject.includes(TRANSLATION_SYNC_MARKER)) return false;
  return true;
}
