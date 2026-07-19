import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import fg from "fast-glob";
import { readFileSync } from "node:fs";
import matter from "gray-matter";
import { checkTranslationIntegrity } from "../lib/translation-integrity.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const strict = process.argv.includes("--strict");

const files = fg
  .sync("content/docs/**/*.{md,mdx}", { cwd: ROOT })
  .map((rel) => {
    const data = matter(readFileSync(path.join(ROOT, rel), "utf8")).data ?? {};
    return {
      path: rel,
      docId:
        typeof data.docId === "string" && data.docId.trim()
          ? data.docId.trim()
          : null,
      lang:
        typeof data.lang === "string" ? data.lang.trim().toLowerCase() : null,
      translatedFrom:
        typeof data.translatedFrom === "string" && data.translatedFrom.trim()
          ? data.translatedFrom.trim().toLowerCase()
          : null,
    };
  });

const findings = checkTranslationIntegrity(files);
const errors = findings.filter((f) => f.level === "error");
const warnings = findings.filter((f) => f.level === "warning");

for (const f of findings) {
  console.log(`[${f.level}] ${f.rule}\n  ${f.path}\n  ${f.message}`);
}
console.log(
  `\n${files.length} files checked: ${errors.length} error(s), ${warnings.length} warning(s)`,
);

if (errors.length > 0 && strict) process.exit(1);
