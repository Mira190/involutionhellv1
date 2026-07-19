#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import matter from "gray-matter";
import { processDoc, serializeTm } from "./lib/translate-core.mjs";
import {
  createAnthropicProvider,
  createMockProvider,
} from "./lib/translate-provider.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_DIR = path.join(ROOT, "content", "docs");
const TM_PATH = path.join(ROOT, "generated", "translation-memory.json");
const CONFLICTS_PATH = path.join(ROOT, "generated", "translation-conflicts.md");

const APPLY = process.env.APPLY === "1";
const PROVIDER_NAME = process.env.PROVIDER ?? "anthropic";
const MODEL = process.env.TRANSLATE_MODEL ?? "claude-opus-4-8";
const ONLY = process.env.ONLY ?? "";
const ADOPT_CONFLICTS = process.env.ADOPT_CONFLICTS === "1";

function listSourceFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(md|mdx)$/.test(entry.name)) files.push(full);
    }
  };
  walk(DOCS_DIR);
  const all = new Set(files);
  const sources = [];
  for (const file of files) {
    if (/\.en\.(md|mdx)$/.test(file)) continue;
    if (
      !/\.zh\.(md|mdx)$/.test(file) &&
      all.has(file.replace(/\.(md|mdx)$/, ".zh.$1"))
    ) {
      console.warn(
        `warn: ${path.relative(ROOT, file)} has a .zh sibling; using the .zh file as the source`,
      );
      continue;
    }
    sources.push(file);
  }
  return sources.sort();
}

function targetPathFor(sourceFile) {
  return sourceFile.replace(/(?:\.zh)?\.(md|mdx)$/, ".en.$1");
}

function loadTm() {
  if (!fs.existsSync(TM_PATH)) return { version: 1, entries: {} };
  const parsed = JSON.parse(fs.readFileSync(TM_PATH, "utf8"));
  if (parsed.version !== 1) {
    throw new Error(
      `unsupported translation-memory version: ${parsed.version}`,
    );
  }
  parsed.entries ??= {};
  return parsed;
}

function buildConflictsMarkdown(conflicts) {
  const lines = [
    "# Translation conflicts",
    "",
    "Regenerated on every `APPLY=1` run of `pnpm translate:docs`; reflects the",
    "conflicts of the latest run only. See dev_docs/translation-pipeline-usage.md",
    "for how to resolve entries.",
    "",
  ];
  if (conflicts.length === 0) {
    lines.push("No conflicts.", "");
    return lines.join("\n");
  }
  for (const conflict of conflicts) {
    lines.push(
      `- **${conflict.docId}** — \`${conflict.heading}\`: ${conflict.reason}`,
    );
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  let provider = null;
  if (APPLY) {
    if (PROVIDER_NAME === "mock") {
      provider = createMockProvider();
    } else if (PROVIDER_NAME === "anthropic") {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.error(
          "APPLY=1 requires ANTHROPIC_API_KEY (or PROVIDER=mock for a dry pseudo-translation)",
        );
        process.exit(1);
      }
      provider = createAnthropicProvider({ apiKey, model: MODEL });
    } else {
      console.error(`unknown PROVIDER: ${PROVIDER_NAME}`);
      process.exit(1);
    }
  }

  const tm = loadTm();
  const mode = APPLY ? "apply" : "plan";
  const totals = {
    filesScanned: 0,
    filesNoTranslate: 0,
    units: 0,
    reused: 0,
    adopted: 0,
    adoptedEdits: 0,
    translated: 0,
    conflicts: 0,
    providerCalls: 0,
    docsSkipped: 0,
    filesWritten: 0,
  };
  const allConflicts = [];
  const translatePlan = [];

  for (const sourceFile of listSourceFiles()) {
    const relSource = path.relative(ROOT, sourceFile);
    if (ONLY && !relSource.includes(ONLY)) continue;
    const sourceRaw = fs.readFileSync(sourceFile, "utf8");
    const { data } = matter(sourceRaw);
    if (data.noTranslate === true) {
      totals.filesNoTranslate++;
      continue;
    }
    totals.filesScanned++;
    const docId = data.docId ?? relSource;
    const targetFile = targetPathFor(sourceFile);
    const targetRaw = fs.existsSync(targetFile)
      ? fs.readFileSync(targetFile, "utf8")
      : null;

    const result = await processDoc({
      sourceRaw,
      targetRaw,
      docId,
      sourcePath: relSource,
      tm,
      provider,
      mode,
      model: provider?.model ?? MODEL,
      adoptConflicts: ADOPT_CONFLICTS,
    });

    for (const key of [
      "units",
      "reused",
      "adopted",
      "adoptedEdits",
      "translated",
      "conflicts",
      "providerCalls",
    ]) {
      totals[key] += result.stats[key];
    }
    if (result.stats.skipped) totals.docsSkipped++;
    allConflicts.push(...result.conflicts);
    if (!APPLY && result.stats.translated > 0) {
      translatePlan.push({ relSource, count: result.stats.translated });
    }

    if (APPLY && !result.stats.skipped) {
      tm.entries[docId] = result.tmDoc;
      if (result.output !== null && result.output !== targetRaw) {
        fs.writeFileSync(targetFile, result.output, "utf8");
        totals.filesWritten++;
      }
    }
  }

  if (APPLY) {
    fs.writeFileSync(TM_PATH, serializeTm(tm), "utf8");
    fs.writeFileSync(
      CONFLICTS_PATH,
      buildConflictsMarkdown(allConflicts),
      "utf8",
    );
  }

  console.log(
    `mode: ${mode}${APPLY ? ` (provider: ${PROVIDER_NAME}, model: ${provider?.model})` : " (DRY_RUN — nothing written)"}`,
  );
  console.log(`files scanned:        ${totals.filesScanned}`);
  console.log(`files noTranslate:    ${totals.filesNoTranslate}`);
  console.log(`units (fm + segments):${totals.units}`);
  console.log(`TM hits (reuse):      ${totals.reused}`);
  console.log(`adopt existing .en:   ${totals.adopted}`);
  console.log(`adopt human edits:    ${totals.adoptedEdits}`);
  console.log(`needs translation:    ${totals.translated}`);
  console.log(`conflicts:            ${totals.conflicts}`);
  console.log(`docs needing manual alignment: ${totals.docsSkipped}`);
  if (APPLY) {
    console.log(`provider calls:       ${totals.providerCalls}`);
    console.log(`target files written: ${totals.filesWritten}`);
  } else if (translatePlan.length > 0) {
    console.log("\nsegments that would call the provider:");
    for (const item of translatePlan.slice(0, 20)) {
      console.log(`  ${item.relSource}: ${item.count}`);
    }
    if (translatePlan.length > 20) {
      console.log(`  ... and ${translatePlan.length - 20} more files`);
    }
  }
  if (!APPLY && allConflicts.length > 0) {
    console.log("\nconflicts that would be recorded:");
    for (const conflict of allConflicts.slice(0, 20)) {
      console.log(
        `  ${conflict.docId} — ${conflict.heading}: ${conflict.reason}`,
      );
    }
    if (allConflicts.length > 20) {
      console.log(`  ... and ${allConflicts.length - 20} more`);
    }
  }
}

await main();
