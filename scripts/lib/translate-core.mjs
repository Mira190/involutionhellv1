import matter from "gray-matter";
import { segmentMdx, hashText } from "../../lib/mdx-segment.ts";

export const PH_RE = /⟦PH(\d+)⟧/g;

const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;

export function protectPlaceholders(text) {
  const tokens = [];
  const take = (original) => {
    const token = `⟦PH${tokens.length}⟧`;
    tokens.push({ token, original });
    return token;
  };

  const out = [];
  let fence = null;
  let block = null;
  for (const line of text.split("\n")) {
    if (fence) {
      block.push(line);
      const close = line.match(FENCE_CLOSE_RE);
      if (close && close[1][0] === fence.char && close[1].length >= fence.len) {
        fence = null;
        out.push(take(block.join("\n")));
        block = null;
      }
      continue;
    }
    const open = line.match(FENCE_OPEN_RE);
    if (open && !(open[1][0] === "`" && open[2].includes("`"))) {
      fence = { char: open[1][0], len: open[1].length };
      block = [line];
      continue;
    }
    out.push(line);
  }
  if (block) out.push(take(block.join("\n")));

  const masked = out
    .join("\n")
    .replace(/\$\$[\s\S]+?\$\$/g, take)
    .replace(/^(?:import|export)[ \t].*$/gm, take)
    .replace(/(`+)[^`\n]+\1/g, take)
    .replace(/\$[^$\n⟦]+\$/g, take)
    .replace(/<\/?[A-Za-z][^<>\n]*?\/?>/g, take)
    .replace(/https?:\/\/[^\s)\]>"'⟦]+/g, take);
  return { masked, tokens };
}

export function verifyPlaceholders(text, tokens) {
  const found = [...text.matchAll(PH_RE)].map((m) => m[0]);
  const issued = tokens.map((t) => t.token);
  const foundCounts = new Map();
  for (const token of found) {
    foundCounts.set(token, (foundCounts.get(token) ?? 0) + 1);
  }
  const missing = issued.filter((t) => (foundCounts.get(t) ?? 0) === 0);
  const issuedSet = new Set(issued);
  const unexpected = found.filter((t) => !issuedSet.has(t));
  const duplicated = issued.filter((t) => (foundCounts.get(t) ?? 0) > 1);
  const ok =
    missing.length === 0 && unexpected.length === 0 && duplicated.length === 0;
  return { ok, missing, unexpected, duplicated };
}

export function restorePlaceholders(text, tokens) {
  let restored = text;
  for (const { token, original } of tokens) {
    restored = restored.split(token).join(original);
  }
  return restored;
}

export async function translateUnit(text, provider, context = {}) {
  const { masked, tokens } = protectPlaceholders(text);
  if (masked.replace(PH_RE, "").trim() === "") {
    return { text, providerCalls: 0 };
  }
  let providerCalls = 0;
  let response = await provider.translate({
    text: masked,
    sourceLang: "zh",
    targetLang: "en",
    context,
  });
  providerCalls++;
  let check = verifyPlaceholders(response, tokens);
  if (!check.ok) {
    response = await provider.translate({
      text: masked,
      sourceLang: "zh",
      targetLang: "en",
      context,
    });
    providerCalls++;
    check = verifyPlaceholders(response, tokens);
    if (!check.ok) {
      const detail = [
        check.missing.length ? `missing ${check.missing.join(",")}` : "",
        check.unexpected.length
          ? `unexpected ${check.unexpected.join(",")}`
          : "",
        check.duplicated.length
          ? `duplicated ${check.duplicated.join(",")}`
          : "",
      ]
        .filter(Boolean)
        .join("; ");
      const error = new Error(`placeholder mismatch after retry: ${detail}`);
      error.code = "PLACEHOLDER_MISMATCH";
      error.providerCalls = providerCalls;
      throw error;
    }
  }
  return { text: restorePlaceholders(response, tokens), providerCalls };
}

function yamlDoubleQuoted(value) {
  return (
    '"' +
    String(value)
      .replace(/\\/g, "\\\\")
      .replace(/"/g, '\\"')
      .replace(/\n/g, "\\n")
      .replace(/\t/g, "\\t") +
    '"'
  );
}

const TOP_LEVEL_KEY_RE = /^[\w-]+:/;

function findKeyBlock(lines, key) {
  const start = lines.findIndex((line) => line.startsWith(`${key}:`));
  if (start === -1) return null;
  let end = start + 1;
  while (end < lines.length) {
    const line = lines[end];
    if (line !== "" && !/^[ \t]/.test(line) && TOP_LEVEL_KEY_RE.test(line)) {
      break;
    }
    end++;
  }
  return [start, end];
}

const PIPELINE_KEYS = [
  "lang",
  "translatedFrom",
  "translatedAt",
  "translatorAgent",
  "sourceHash",
  "sourcePath",
  "noTranslate",
];

export function buildTargetFrontmatter({
  sourceFrontmatter,
  overrides = {},
  pipeline,
}) {
  const inner = sourceFrontmatter.match(/^---\r?\n([\s\S]*?)\r?\n---$/);
  let lines = inner ? inner[1].split("\n") : [];
  for (const key of PIPELINE_KEYS) {
    const block = findKeyBlock(lines, key);
    if (block) lines.splice(block[0], block[1] - block[0]);
  }
  for (const key of ["title", "description"]) {
    if (overrides[key] === undefined) continue;
    const replacement = `${key}: ${yamlDoubleQuoted(overrides[key])}`;
    const block = findKeyBlock(lines, key);
    if (block) lines.splice(block[0], block[1] - block[0], replacement);
    else lines.push(replacement);
  }
  while (lines.length > 0 && lines[lines.length - 1].trim() === "") {
    lines.pop();
  }
  const pipelineLines = [
    "lang: en",
    "translatedFrom: zh",
    `sourceHash: ${pipeline.sourceHash}`,
    `translatorAgent: ${yamlDoubleQuoted(pipeline.translatorAgent)}`,
    `sourcePath: ${yamlDoubleQuoted(pipeline.sourcePath)}`,
  ];
  return ["---", ...lines, ...pipelineLines, "---"].join("\n");
}

function decideUnit({ unit, docTm, docHasTm, machineHashes, adoptConflicts }) {
  const entry = docTm[unit.hash];
  const current = unit.current;
  const currentHash = current == null ? null : hashText(current);
  if (entry) {
    if (currentHash == null || currentHash === entry.targetHash) {
      return "reuse";
    }
    return "adopt-edit";
  }
  if (current == null) return "translate";
  if (machineHashes.has(currentHash)) return "translate";
  if (!docHasTm) return "adopt";
  return adoptConflicts ? "adopt-edit" : "conflict";
}

/** @typedef {{ target: string, targetHash: string, model: string, at: string }} TmEntry */
/** @typedef {{ version: number, entries: Record<string, Record<string, TmEntry>> }} TranslationMemory */
/** @typedef {{ model: string, name?: string, translate: (req: { text: string, sourceLang?: string, targetLang?: string, context?: unknown }) => Promise<string> }} TranslateProvider */

/**
 * @param {{
 *   sourceRaw: string,
 *   targetRaw?: string | null,
 *   docId: string,
 *   sourcePath: string,
 *   tm: TranslationMemory,
 *   provider?: TranslateProvider | null,
 *   mode?: "plan" | "apply",
 *   model?: string,
 *   now?: () => string,
 *   adoptConflicts?: boolean,
 * }} options
 */
export async function processDoc({
  sourceRaw,
  targetRaw = null,
  docId,
  sourcePath,
  tm,
  provider = null,
  mode = "plan",
  model = provider?.model ?? "unknown",
  now = () => new Date().toISOString(),
  adoptConflicts = false,
}) {
  const docTm = /** @type {Record<string, TmEntry>} */ (
    tm.entries?.[docId] ?? {}
  );
  const docHasTm = Object.keys(docTm).length > 0;
  const machineHashes = new Set(
    Object.values(docTm).map((entry) => entry.targetHash),
  );

  const source = segmentMdx(sourceRaw);
  const sourceData = matter(sourceRaw).data;
  const sourceBody = source.segments.map((s) => s.content).join("\n");

  const target = targetRaw == null ? null : segmentMdx(targetRaw);
  const targetData = targetRaw == null ? null : matter(targetRaw).data;

  const stats = {
    units: 0,
    reused: 0,
    adopted: 0,
    adoptedEdits: 0,
    translated: 0,
    conflicts: 0,
    providerCalls: 0,
    skipped: false,
  };
  const conflicts = [];

  let bodyCurrent;
  if (target == null) {
    bodyCurrent = source.segments.map(() => null);
  } else if (target.segments.length === source.segments.length) {
    bodyCurrent = target.segments.map((s) => s.content);
  } else if (target.segments.every((s) => machineHashes.has(s.hash))) {
    bodyCurrent = source.segments.map(() => null);
  } else {
    stats.skipped = true;
    conflicts.push({
      docId,
      heading: "(document)",
      reason: `cannot align existing translation: source has ${source.segments.length} segments, target has ${target.segments.length}, and the target contains content not recorded in the translation memory; resolve manually, then rerun with ADOPT_CONFLICTS=1 or align the segment structure`,
    });
    return { output: null, tmDoc: docTm, conflicts, stats };
  }

  const units = [];
  for (const key of ["title", "description"]) {
    const value = sourceData[key];
    if (typeof value !== "string" || value === "") continue;
    const currentValue = targetData?.[key];
    units.push({
      id: `frontmatter:${key}`,
      kind: key,
      heading: `frontmatter:${key}`,
      text: value,
      hash: hashText(value),
      current: typeof currentValue === "string" ? currentValue : null,
    });
  }
  source.segments.forEach((segment, i) => {
    units.push({
      id: `segment:${i}`,
      kind: "segment",
      heading: segment.heading ?? "(preamble)",
      text: segment.content,
      hash: segment.hash,
      current: bodyCurrent[i],
    });
  });

  const tmDoc = /** @type {Record<string, TmEntry>} */ ({});
  const outputs = new Map();
  for (const unit of units) {
    stats.units++;
    const action = decideUnit({
      unit,
      docTm,
      docHasTm,
      machineHashes,
      adoptConflicts,
    });
    const entry = docTm[unit.hash];
    if (action === "reuse") {
      stats.reused++;
      outputs.set(unit.id, entry.target);
      tmDoc[unit.hash] = entry;
    } else if (action === "adopt" || action === "adopt-edit") {
      if (action === "adopt") stats.adopted++;
      else stats.adoptedEdits++;
      outputs.set(unit.id, unit.current);
      tmDoc[unit.hash] = {
        target: unit.current,
        targetHash: hashText(unit.current),
        model: action === "adopt" ? "adopted" : "human",
        at: now(),
      };
    } else if (action === "translate") {
      stats.translated++;
      if (mode === "plan") continue;
      try {
        const result = await translateUnit(unit.text, provider, {
          docId,
          heading: unit.heading,
        });
        stats.providerCalls += result.providerCalls;
        outputs.set(unit.id, result.text);
        tmDoc[unit.hash] = {
          target: result.text,
          targetHash: hashText(result.text),
          model,
          at: now(),
        };
      } catch (error) {
        if (error.code !== "PLACEHOLDER_MISMATCH") throw error;
        stats.providerCalls += error.providerCalls ?? 0;
        stats.translated--;
        stats.conflicts++;
        outputs.set(unit.id, unit.text);
        conflicts.push({
          docId,
          heading: unit.heading,
          reason: `left untranslated: ${error.message}`,
        });
      }
    } else {
      stats.conflicts++;
      outputs.set(unit.id, unit.current);
      conflicts.push({
        docId,
        heading: unit.heading,
        reason:
          "human-edited target segment and changed source segment; kept the human text — merge the source change manually, then rerun with ADOPT_CONFLICTS=1",
      });
    }
  }

  if (mode === "plan") {
    return { output: null, tmDoc: docTm, conflicts, stats };
  }

  const body = source.segments
    .map((_, i) => outputs.get(`segment:${i}`))
    .join("\n");
  const overrides = {};
  for (const unit of units) {
    if (unit.kind === "title" || unit.kind === "description") {
      overrides[unit.kind] = outputs.get(unit.id);
    }
  }
  const frontmatter = buildTargetFrontmatter({
    sourceFrontmatter: source.frontmatter,
    overrides,
    pipeline: {
      sourceHash: hashText(sourceBody),
      translatorAgent: model,
      sourcePath,
    },
  });
  let output = `${frontmatter}\n${body}`;
  if (!output.endsWith("\n")) output += "\n";

  return { output, tmDoc, conflicts, stats };
}

export function serializeTm(tm) {
  const entries = {};
  for (const docId of Object.keys(tm.entries ?? {}).sort()) {
    const doc = tm.entries[docId];
    const hashes = Object.keys(doc).sort();
    if (hashes.length === 0) continue;
    const sortedDoc = {};
    for (const hash of hashes) {
      const { target, targetHash, model, at } = doc[hash];
      sortedDoc[hash] = { target, targetHash, model, at };
    }
    entries[docId] = sortedDoc;
  }
  return `${JSON.stringify({ version: 1, entries }, null, 2)}\n`;
}
