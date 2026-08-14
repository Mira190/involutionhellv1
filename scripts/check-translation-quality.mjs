#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { checkTranslationPair } from "../lib/translation-quality.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_DIR = path.join(ROOT, "content", "docs");
const DIFF_BASE = process.env.DIFF_BASE ?? "origin/main";

const RULES = [
  "fence-integrity",
  "heading-parity",
  "internal-link",
  "residual-cjk",
  "frontmatter",
  "length-ratio",
  "segment-count",
];

function parseArgs(argv) {
  const options = { strict: false, changedOnly: false, changedFiles: [] };
  let collectingChanged = false;
  for (const arg of argv) {
    if (arg === "--strict") {
      options.strict = true;
      collectingChanged = false;
    } else if (arg === "--changed") {
      options.changedOnly = true;
      collectingChanged = true;
    } else if (collectingChanged) {
      options.changedFiles.push(arg);
    } else {
      console.error(`unknown argument: ${arg}`);
      process.exit(2);
    }
  }
  if (process.env.CHANGED_ONLY === "1") options.changedOnly = true;
  return options;
}

function listAllDocs() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(md|mdx)$/.test(entry.name)) files.push(full);
    }
  };
  walk(DOCS_DIR);
  return files;
}

function targetPathFor(sourceFile) {
  return sourceFile.replace(/(?:\.zh)?\.(md|mdx)$/, ".en.$1");
}

function sourcePathFor(targetFile) {
  const zh = targetFile.replace(/\.en\.(md|mdx)$/, ".zh.$1");
  if (fs.existsSync(zh)) return zh;
  return targetFile.replace(/\.en\.(md|mdx)$/, ".$1");
}

function listAllPairs() {
  const files = listAllDocs();
  const all = new Set(files);
  const pairs = [];
  for (const file of files) {
    if (/\.en\.(md|mdx)$/.test(file)) continue;
    if (
      !/\.zh\.(md|mdx)$/.test(file) &&
      all.has(file.replace(/\.(md|mdx)$/, ".zh.$1"))
    ) {
      continue;
    }
    const target = targetPathFor(file);
    if (all.has(target)) pairs.push({ source: file, target });
  }
  return pairs.sort((a, b) => a.source.localeCompare(b.source));
}

function changedDocFiles(explicit) {
  if (explicit.length > 0) {
    return explicit.map((f) => path.resolve(ROOT, f));
  }
  const diff = execSync(`git diff --name-only ${DIFF_BASE}...HEAD`, {
    cwd: ROOT,
    encoding: "utf8",
  });
  return diff
    .split("\n")
    .filter((line) => /^content\/docs\/.*\.(md|mdx)$/.test(line))
    .map((rel) => path.join(ROOT, rel));
}

function pairsForChanged(files) {
  const bySource = new Map();
  for (const file of files) {
    const source = /\.en\.(md|mdx)$/.test(file) ? sourcePathFor(file) : file;
    const target = targetPathFor(source);
    if (!fs.existsSync(source) || !fs.existsSync(target)) continue;
    bySource.set(source, { source, target });
  }
  return [...bySource.values()].sort((a, b) =>
    a.source.localeCompare(b.source),
  );
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const pairs = options.changedOnly
    ? pairsForChanged(changedDocFiles(options.changedFiles))
    : listAllPairs();

  const docExists = (repoRelPath) =>
    fs.existsSync(path.join(ROOT, repoRelPath));

  const totals = { error: 0, warning: 0, info: 0 };
  const byRule = new Map(
    RULES.map((rule) => [rule, { error: 0, warning: 0, info: 0 }]),
  );
  let pairsWithFindings = 0;

  for (const pair of pairs) {
    const relSource = path.relative(ROOT, pair.source);
    const relTarget = path.relative(ROOT, pair.target);
    const findings = checkTranslationPair({
      sourcePath: relSource,
      targetPath: relTarget,
      sourceRaw: fs.readFileSync(pair.source, "utf8"),
      targetRaw: fs.readFileSync(pair.target, "utf8"),
      docExists,
    });
    if (findings.length === 0) continue;
    pairsWithFindings++;
    console.log(`\n${relSource} <-> ${relTarget}`);
    for (const finding of findings) {
      totals[finding.severity]++;
      byRule.get(finding.rule)[finding.severity]++;
      console.log(
        `  [${finding.severity}] ${finding.rule}: ${finding.message}`,
      );
    }
  }

  console.log(
    `\nmode: ${options.changedOnly ? `changed-only (base: ${DIFF_BASE})` : "full corpus"}${options.strict ? ", strict" : ""}`,
  );
  console.log(`pairs checked:        ${pairs.length}`);
  console.log(`pairs with findings:  ${pairsWithFindings}`);
  console.log(`errors:               ${totals.error}`);
  console.log(`warnings:             ${totals.warning}`);
  console.log(`info:                 ${totals.info}`);
  console.log("\nby rule (errors/warnings/info):");
  for (const rule of RULES) {
    const counts = byRule.get(rule);
    console.log(
      `  ${rule.padEnd(16)} ${String(counts.error).padStart(4)} / ${counts.warning} / ${counts.info}`,
    );
  }

  if (options.strict && totals.error > 0) {
    console.error(
      "\nstrict mode: translation quality errors found — fix them or opt out per file (see rule messages)",
    );
    process.exit(1);
  }
}

main();
