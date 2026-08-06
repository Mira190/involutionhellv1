export interface DocFileMeta {
  path: string;
  docId: string | null;
  lang: string | null;
  translatedFrom: string | null;
}

export interface IntegrityFinding {
  level: "error" | "warning";
  rule: string;
  path: string;
  message: string;
}

const LOCALE_SUFFIX = /\.(en|zh)\.(md|mdx)$/i;
const EXT = /\.(md|mdx)$/i;
const LEETCODE_DIR = "career/interview-prep/leetcode/";

export function localeSuffixOf(path: string): "en" | "zh" | null {
  const m = path.match(LOCALE_SUFFIX);
  return m ? (m[1].toLowerCase() as "en" | "zh") : null;
}

export function baseStemOf(path: string): string {
  return path.replace(LOCALE_SUFFIX, "").replace(EXT, "");
}

export function checkTranslationIntegrity(
  files: DocFileMeta[],
): IntegrityFinding[] {
  const findings: IntegrityFinding[] = [];
  const stems = new Map<
    string,
    { unsuffixed: string[]; en: string[]; zh: string[] }
  >();

  for (const f of files) {
    const stem = baseStemOf(f.path);
    const entry = stems.get(stem) ?? { unsuffixed: [], en: [], zh: [] };
    const suffix = localeSuffixOf(f.path);
    if (suffix === "en") entry.en.push(f.path);
    else if (suffix === "zh") entry.zh.push(f.path);
    else entry.unsuffixed.push(f.path);
    stems.set(stem, entry);
  }

  const originals = files.filter((f) => !f.translatedFrom);
  const byDocId = new Map<string, string[]>();
  for (const f of originals) {
    if (!f.docId) continue;
    byDocId.set(f.docId, [...(byDocId.get(f.docId) ?? []), f.path]);
  }
  for (const [docId, paths] of byDocId) {
    if (paths.length > 1) {
      findings.push({
        level: "error",
        rule: "duplicate-original-docid",
        path: paths.join(" | "),
        message: `docId ${docId} 出现在 ${paths.length} 个非翻译文件（原文必须唯一）`,
      });
    }
  }

  for (const [stem, entry] of stems) {
    if (entry.unsuffixed.length > 0 && entry.zh.length > 0) {
      findings.push({
        level: "error",
        rule: "unsuffixed-zh-conflict",
        path: [...entry.unsuffixed, ...entry.zh].join(" | "),
        message: `${stem}: 不带后缀文件与 .zh 后缀文件并存（fumadocs dot parser 下两者都是 zh，冲突）`,
      });
    }
    for (const p of entry.en) {
      if (entry.unsuffixed.length === 0 && entry.zh.length === 0) {
        findings.push({
          level: "error",
          rule: "orphan-locale-file",
          path: p,
          message: "存在 .en 文件但没有对应的 zh 侧文件（不带后缀或 .zh）",
        });
      }
    }
    for (const p of entry.zh) {
      if (entry.unsuffixed.length === 0 && entry.en.length === 0) {
        findings.push({
          level: "error",
          rule: "orphan-locale-file",
          path: p,
          message: "存在 .zh 文件但没有对应的 .en 文件",
        });
      }
    }
  }

  for (const f of files) {
    const suffix = localeSuffixOf(f.path);
    if (suffix && f.lang && f.lang !== suffix) {
      findings.push({
        level: "error",
        rule: "lang-suffix-mismatch",
        path: f.path,
        message: `文件后缀 .${suffix} 与 frontmatter lang: ${f.lang} 不一致`,
      });
    }
    if (f.translatedFrom && f.lang && f.translatedFrom === f.lang) {
      findings.push({
        level: "error",
        rule: "self-translation",
        path: f.path,
        message: `translatedFrom 与 lang 同为 ${f.lang}（翻译源语言不能等于自身语言）`,
      });
    }
    if (f.translatedFrom && !f.docId) {
      findings.push({
        level: "warning",
        rule: "translation-missing-docid",
        path: f.path,
        message: "翻译文件缺 docId（应继承原文 docId 以便按文档聚合）",
      });
    }
  }

  const leetcodeByNumber = new Map<string, Set<string>>();
  for (const [stem] of stems) {
    const idx = stem.indexOf(LEETCODE_DIR);
    if (idx === -1) continue;
    const name = stem.slice(idx + LEETCODE_DIR.length);
    const m = name.match(/^(\d{1,5})[^0-9]/);
    if (!m) continue;
    const set = leetcodeByNumber.get(m[1]) ?? new Set();
    set.add(stem);
    leetcodeByNumber.set(m[1], set);
  }
  for (const [num, stemSet] of leetcodeByNumber) {
    if (stemSet.size > 1) {
      findings.push({
        level: "warning",
        rule: "leetcode-number-duplicate",
        path: [...stemSet].join(" | "),
        message: `LeetCode 题号 ${num} 存在 ${stemSet.size} 套不同 base 文件名（疑似同题重复文档）`,
      });
    }
  }

  return findings.sort(
    (a, b) =>
      (a.level === b.level ? 0 : a.level === "error" ? -1 : 1) ||
      a.rule.localeCompare(b.rule) ||
      a.path.localeCompare(b.path),
  );
}
