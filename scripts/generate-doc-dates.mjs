import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 浅克隆（Vercel 构建默认带 --depth）下 `git log` 只看得到一两个 commit，
 * 全部文档会被算成同一天——比没有日期更糟。宁可拒绝生成也不写坏数据。
 */
function assertFullHistory(root) {
  const shallow = execFileSync("git", ["rev-parse", "--is-shallow-repository"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  if (shallow === "true") {
    console.error(
      "[doc-dates] refusing to run in a shallow clone: every doc would collapse to the checkout date. Re-run with full history (fetch-depth: 0).",
    );
    process.exit(1);
  }
}

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const DOCS_DIR = "content/docs";
const OUTPUT_PATH = "generated/doc-dates.json";

export function parseLogEntry(line) {
  const sep1 = line.indexOf("|");
  const sep2 = line.indexOf("|", sep1 + 1);
  if (sep1 < 0 || sep2 < 0) return null;
  const timestamp = Number(line.slice(0, sep1));
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return {
    timestamp,
    author: line.slice(sep1 + 1, sep2),
    subject: line.slice(sep2 + 1),
  };
}

export function isExcludedCommit({ author, subject }) {
  return author.includes("[bot]") || subject.includes("[skip ci]");
}

export function toDateString(timestamp) {
  return new Date(timestamp * 1000).toISOString().slice(0, 10);
}

function buildDocDates() {
  // 单次 git log --name-only 全量遍历，替代逐文件 git log（~300 次子进程）。
  // core.quotepath=false：content/docs 下有中文文件名，默认会被八进制转义。
  const raw = execFileSync(
    "git",
    [
      "-c",
      "core.quotepath=false",
      "log",
      "--format=%x01%ct|%an|%s",
      "--name-only",
      "--",
      DOCS_DIR,
    ],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 128 * 1024 * 1024 },
  );

  const latestByFile = new Map();
  for (const block of raw.split("\x01")) {
    if (!block.trim()) continue;
    const [header, ...fileLines] = block.split("\n");
    const entry = parseLogEntry(header);
    if (!entry || isExcludedCommit(entry)) continue;
    for (const fileLine of fileLines) {
      const file = fileLine.trim();
      if (!file.startsWith(`${DOCS_DIR}/`)) continue;
      const known = latestByFile.get(file);
      if (known !== undefined && known >= entry.timestamp) continue;
      if (known === undefined && !existsSync(path.join(repoRoot, file)))
        continue;
      latestByFile.set(file, entry.timestamp);
    }
  }

  return Object.fromEntries(
    [...latestByFile.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([file, timestamp]) => [file, toDateString(timestamp)]),
  );
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  assertFullHistory(repoRoot);
  const dates = buildDocDates();
  mkdirSync(path.join(repoRoot, "generated"), { recursive: true });
  writeFileSync(
    path.join(repoRoot, OUTPUT_PATH),
    `${JSON.stringify(dates, null, 2)}\n`,
  );
  console.log(`${OUTPUT_PATH}: ${Object.keys(dates).length} entries`);
}
