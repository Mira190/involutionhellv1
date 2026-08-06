#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DOCS_DIR = path.join(ROOT, "content", "docs");

const FM_RE = /^(---\r?\n)([\s\S]*?)(\r?\n---)(\r?\n|$)/;

function listEnFiles() {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.en\.(md|mdx)$/.test(entry.name)) files.push(full);
    }
  };
  walk(DOCS_DIR);
  return files.sort();
}

function resolveSource(enFile) {
  const zh = enFile.replace(/\.en\.(md|mdx)$/, ".zh.$1");
  if (fs.existsSync(zh)) return zh;
  const plain = enFile.replace(/\.en\.(md|mdx)$/, ".$1");
  if (fs.existsSync(plain)) return plain;
  return null;
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

function main() {
  const totals = {
    scanned: 0,
    noFrontmatter: 0,
    addedLang: 0,
    addedTranslatedFrom: 0,
    addedSourcePath: 0,
    sourceUnresolvable: 0,
    filesChanged: 0,
  };

  for (const file of listEnFiles()) {
    totals.scanned++;
    const rel = path.relative(ROOT, file);
    const raw = fs.readFileSync(file, "utf8");
    const m = raw.match(FM_RE);
    if (!m) {
      totals.noFrontmatter++;
      console.warn(`warn: ${rel} has no frontmatter block; skipped`);
      continue;
    }
    const lines = m[2].split("\n");
    const hasKey = (key) => lines.some((line) => line.startsWith(`${key}:`));
    const additions = [];
    if (!hasKey("lang")) {
      additions.push("lang: en");
      totals.addedLang++;
    }
    if (!hasKey("translatedFrom")) {
      additions.push("translatedFrom: zh");
      totals.addedTranslatedFrom++;
    }
    if (!hasKey("sourcePath")) {
      const source = resolveSource(file);
      if (source === null) {
        totals.sourceUnresolvable++;
      } else {
        const relSource = path.relative(ROOT, source).split(path.sep).join("/");
        additions.push(`sourcePath: ${yamlDoubleQuoted(relSource)}`);
        totals.addedSourcePath++;
      }
    }
    if (additions.length === 0) continue;
    const updated =
      m[1] +
      [...lines, ...additions].join("\n") +
      m[3] +
      raw.slice(m[0].length - m[4].length);
    fs.writeFileSync(file, updated, "utf8");
    totals.filesChanged++;
    console.log(
      `fixed: ${rel} (+${additions.map((a) => a.split(":")[0]).join(", +")})`,
    );
  }

  console.log(`\n.en files scanned:     ${totals.scanned}`);
  console.log(`no frontmatter:        ${totals.noFrontmatter}`);
  console.log(`added lang:            ${totals.addedLang}`);
  console.log(`added translatedFrom:  ${totals.addedTranslatedFrom}`);
  console.log(`added sourcePath:      ${totals.addedSourcePath}`);
  console.log(`source unresolvable:   ${totals.sourceUnresolvable}`);
  console.log(`files changed:         ${totals.filesChanged}`);
}

main();
