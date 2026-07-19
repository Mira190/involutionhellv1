import path from "node:path";
import matter from "gray-matter";
import {
  extractFences,
  segmentMdx,
  type CodeFence,
  type Segment,
} from "./mdx-segment.ts";

export type QualityRule =
  | "fence-integrity"
  | "heading-parity"
  | "internal-link"
  | "residual-cjk"
  | "frontmatter"
  | "length-ratio"
  | "segment-count";

export interface QualityFinding {
  rule: QualityRule;
  severity: "error" | "warning";
  message: string;
}

export interface PairCheckInput {
  sourcePath: string;
  targetPath: string;
  sourceRaw: string;
  targetRaw: string;
  docExists?: (repoRelPath: string) => boolean;
}

export type DocLang = "zh" | "en";

export function langFromPath(filePath: string): DocLang {
  return /\.en\.(md|mdx)$/.test(filePath) ? "en" : "zh";
}

const CJK_RE = /[㐀-䶿一-鿿]/g;
const INLINE_CODE_RE = /(`+)[^`\n]+\1/g;
const LINK_RE = /\]\(<?([^)\s>]+)>?(?:\s+["'][^)]*)?\)/g;
const DOC_EXTENSIONS = [
  ".mdx",
  ".md",
  ".en.mdx",
  ".en.md",
  ".zh.mdx",
  ".zh.md",
];

const LENGTH_RATIO_MIN = 0.8;
const LENGTH_RATIO_MAX = 4.0;
const LENGTH_RATIO_MIN_SOURCE_CHARS = 20;

function fencedLineSet(fences: CodeFence[]): Set<number> {
  const masked = new Set<number>();
  for (const fence of fences) {
    for (let line = fence.openLine; line <= fence.closeLine; line++) {
      masked.add(line);
    }
  }
  return masked;
}

function proseLines(body: string): { lineNo: number; text: string }[] {
  const masked = fencedLineSet(extractFences(body));
  return body
    .split("\n")
    .map((text, i) => ({ lineNo: i + 1, text }))
    .filter(({ lineNo }) => !masked.has(lineNo))
    .map(({ lineNo, text }) => ({
      lineNo,
      text: text.replace(INLINE_CODE_RE, ""),
    }));
}

function checkFenceIntegrity(
  sourceBody: string,
  targetBody: string,
): QualityFinding[] {
  const sourceFences = extractFences(sourceBody);
  const targetFences = extractFences(targetBody);
  if (sourceFences.length !== targetFences.length) {
    return [
      {
        rule: "fence-integrity",
        severity: "error",
        message: `code fence count mismatch: source has ${sourceFences.length}, target has ${targetFences.length}`,
      },
    ];
  }
  const findings: QualityFinding[] = [];
  sourceFences.forEach((sf, i) => {
    const tf = targetFences[i];
    if (sf.info !== tf.info) {
      findings.push({
        rule: "fence-integrity",
        severity: "error",
        message: `fence #${i + 1} (target line ${tf.openLine}) info string mismatch: source "${sf.info}", target "${tf.info}"`,
      });
    }
    if (sf.content !== tf.content) {
      findings.push({
        rule: "fence-integrity",
        severity: "error",
        message: `fence #${i + 1} (target line ${tf.openLine}, ${sf.info || "no info"}) content differs from source — fences must never be translated`,
      });
    }
  });
  return findings;
}

interface HeadingInfo {
  slug: string;
  depth: number;
}

function headingsOf(segments: Segment[]): HeadingInfo[] {
  return segments
    .filter((s) => s.headingSlug !== null && s.depth !== null)
    .map((s) => ({ slug: s.headingSlug as string, depth: s.depth as number }));
}

function checkHeadingParity(
  sourceSegments: Segment[],
  targetSegments: Segment[],
): QualityFinding[] {
  const source = headingsOf(sourceSegments);
  const target = headingsOf(targetSegments);
  if (
    source.length === target.length &&
    source.every((h, i) => h.depth === target[i].depth)
  ) {
    return [];
  }
  const dropped: string[] = [];
  let j = 0;
  for (const heading of source) {
    if (j < target.length && target[j].depth === heading.depth) {
      j++;
    } else {
      dropped.push(heading.slug);
    }
  }
  let message = `heading structure mismatch: source has ${source.length} headings, target has ${target.length}`;
  if (dropped.length > 0) {
    message += `; source headings with no positional counterpart: ${dropped.join(", ")}`;
  }
  return [{ rule: "heading-parity", severity: "error", message }];
}

function docPathCandidates(repoRelBase: string): string[] {
  if (/\.(md|mdx)$/.test(repoRelBase)) return [repoRelBase];
  const base = repoRelBase.replace(/\/$/, "");
  return [
    ...DOC_EXTENSIONS.map((ext) => `${base}${ext}`),
    ...DOC_EXTENSIONS.map((ext) => `${base}/index${ext}`),
  ];
}

function checkInternalLinks(
  targetBody: string,
  targetPath: string,
  targetSegments: Segment[],
  docExists?: (repoRelPath: string) => boolean,
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  const ownSlugs = new Set(
    targetSegments
      .filter((s) => s.headingSlug !== null)
      .map((s) => s.headingSlug),
  );
  const prose = proseLines(targetBody);

  const checkDocTarget = (repoRelBase: string, url: string, lineNo: number) => {
    if (!docExists) return;
    if (!docPathCandidates(repoRelBase).some((c) => docExists(c))) {
      findings.push({
        rule: "internal-link",
        severity: "error",
        message: `line ${lineNo}: broken doc link "${url}" — no matching file under content/docs`,
      });
    }
  };

  for (const { lineNo, text } of prose) {
    for (const match of text.matchAll(LINK_RE)) {
      const url = match[1];
      if (url.startsWith("#")) {
        let anchor = url.slice(1);
        try {
          anchor = decodeURIComponent(anchor);
        } catch {
          /* keep raw anchor */
        }
        if (!ownSlugs.has(anchor)) {
          findings.push({
            rule: "internal-link",
            severity: "error",
            message: `line ${lineNo}: broken in-page anchor "#${anchor}" — no matching heading in this file`,
          });
        }
        continue;
      }
      if (/^[a-z][a-z0-9+.-]*:/i.test(url)) continue;
      const [pathname] = url.split(/[#?]/);
      if (pathname === "") continue;
      if (pathname.startsWith("/docs/")) {
        checkDocTarget(
          path.posix.join("content/docs", pathname.slice("/docs/".length)),
          url,
          lineNo,
        );
        continue;
      }
      if (pathname.startsWith("./") || pathname.startsWith("../")) {
        const hasExtension = /\.[a-z0-9]+$/i.test(pathname.replace(/\/$/, ""));
        if (hasExtension && !/\.(md|mdx)$/.test(pathname)) continue;
        const resolved = path.posix.join(
          path.posix.dirname(targetPath.split(path.sep).join("/")),
          pathname,
        );
        if (!resolved.startsWith("content/docs/")) continue;
        checkDocTarget(resolved, url, lineNo);
      }
    }
  }
  return findings;
}

function checkResidualCjk(
  targetBody: string,
  targetData: Record<string, unknown>,
  sourceData: Record<string, unknown>,
): QualityFinding[] {
  if (targetData.allowCjk === true || sourceData.allowCjk === true) return [];
  let count = 0;
  const examples: string[] = [];
  for (const { lineNo, text } of proseLines(targetBody)) {
    const matches = text.match(CJK_RE);
    if (!matches) continue;
    count += matches.length;
    if (examples.length < 3) {
      const excerpt = text.trim().slice(0, 80);
      examples.push(`line ${lineNo}: ${excerpt}`);
    }
  }
  if (count === 0) return [];
  return [
    {
      rule: "residual-cjk",
      severity: "error",
      message: `${count} CJK character(s) outside code in an .en file (add frontmatter allowCjk: true if intentional) — ${examples.join(" | ")}`,
    },
  ];
}

function checkFrontmatter(
  sourceData: Record<string, unknown>,
  targetData: Record<string, unknown>,
  sourceLang: DocLang,
  targetLang: DocLang,
): QualityFinding[] {
  const findings: QualityFinding[] = [];
  if (sourceData.docId !== undefined && targetData.docId !== sourceData.docId) {
    findings.push({
      rule: "frontmatter",
      severity: "error",
      message: `docId mismatch: source "${sourceData.docId}", target "${targetData.docId ?? "(missing)"}"`,
    });
  }
  if (targetData.lang !== targetLang) {
    findings.push({
      rule: "frontmatter",
      severity: "error",
      message: `lang should be "${targetLang}" (from file suffix), got "${targetData.lang ?? "(missing)"}"`,
    });
  }
  if (targetData.translatedFrom !== sourceLang) {
    findings.push({
      rule: "frontmatter",
      severity: "error",
      message: `translatedFrom should be "${sourceLang}", got "${targetData.translatedFrom ?? "(missing)"}"`,
    });
  }
  return findings;
}

function nonFenceCharCount(content: string): number {
  const masked = fencedLineSet(extractFences(content));
  return content
    .split("\n")
    .filter((_, i) => !masked.has(i + 1))
    .join("")
    .replace(/\s/g, "").length;
}

function checkLengthRatio(
  sourceSegments: Segment[],
  targetSegments: Segment[],
): QualityFinding[] {
  if (sourceSegments.length !== targetSegments.length) return [];
  const findings: QualityFinding[] = [];
  sourceSegments.forEach((s, i) => {
    const sourceLen = nonFenceCharCount(s.content);
    if (sourceLen < LENGTH_RATIO_MIN_SOURCE_CHARS) return;
    const targetLen = nonFenceCharCount(targetSegments[i].content);
    const ratio = targetLen / sourceLen;
    if (ratio >= LENGTH_RATIO_MIN && ratio <= LENGTH_RATIO_MAX) return;
    findings.push({
      rule: "length-ratio",
      severity: "warning",
      message: `segment "${s.heading ?? "(preamble)"}": target/source length ratio ${ratio.toFixed(2)} outside [${LENGTH_RATIO_MIN}, ${LENGTH_RATIO_MAX}] (source ${sourceLen} chars, target ${targetLen})`,
    });
  });
  return findings;
}

function parseFrontmatter(raw: string): {
  data: Record<string, unknown>;
  error: string | null;
} {
  try {
    return { data: matter(raw).data as Record<string, unknown>, error: null };
  } catch (error) {
    return {
      data: {},
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function checkTranslationPair({
  sourcePath,
  targetPath,
  sourceRaw,
  targetRaw,
  docExists,
}: PairCheckInput): QualityFinding[] {
  const sourceLang = langFromPath(sourcePath);
  const targetLang = langFromPath(targetPath);

  const source = segmentMdx(sourceRaw);
  const target = segmentMdx(targetRaw);
  const sourceBody = source.segments.map((s) => s.content).join("\n");
  const targetBody = target.segments.map((s) => s.content).join("\n");

  const sourceFm = parseFrontmatter(sourceRaw);
  const targetFm = parseFrontmatter(targetRaw);

  const findings: QualityFinding[] = [];
  for (const fm of [
    { label: "source", parsed: sourceFm },
    { label: "target", parsed: targetFm },
  ]) {
    if (fm.parsed.error !== null) {
      findings.push({
        rule: "frontmatter",
        severity: "error",
        message: `${fm.label} frontmatter failed to parse: ${fm.parsed.error}`,
      });
    }
  }

  findings.push(...checkFenceIntegrity(sourceBody, targetBody));
  const headingFindings = checkHeadingParity(source.segments, target.segments);
  findings.push(...headingFindings);
  findings.push(
    ...checkInternalLinks(targetBody, targetPath, target.segments, docExists),
  );
  if (targetLang === "en") {
    findings.push(
      ...checkResidualCjk(targetBody, targetFm.data, sourceFm.data),
    );
  }
  findings.push(
    ...checkFrontmatter(sourceFm.data, targetFm.data, sourceLang, targetLang),
  );
  if (sourceLang === "zh" && targetLang === "en") {
    findings.push(...checkLengthRatio(source.segments, target.segments));
  }
  if (
    headingFindings.length === 0 &&
    source.segments.length !== target.segments.length
  ) {
    findings.push({
      rule: "segment-count",
      severity: "warning",
      message: `segment count mismatch with identical heading structure: source ${source.segments.length}, target ${target.segments.length} (preamble presence differs)`,
    });
  }
  return findings;
}
