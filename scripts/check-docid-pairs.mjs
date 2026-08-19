#!/usr/bin/env node
/**
 * CI 拦截性检查：content/docs 的 docId / locale 配对不变量。
 *
 * 硬失败（exit 1）：
 *   1. 任何 md/mdx 文件缺 docId —— contributors 统计与翻译配对都以 docId 为键
 *   2. locale 对（foo.md ↔ foo.en.md / foo.zh.md）docId 不一致 —— 随机新 id
 *      会把翻译对永久分叉，且 sync-uuid bot 只在"之后某次人类 push"才盖章，
 *      污染极难回溯
 *   3. `.en.*` / `.zh.*` 文件缺 `lang` 字段或与后缀不符 —— 搜索分片、
 *      TranslationNotice、sitemap 过滤都消费这个字段
 *   4. 同 stem 同时存在裸名文件和 `.zh.*` 文件 —— fumadocs dot parser 下两者
 *      都声明 zh，build 时 slug 冲突直接抛错
 *
 * 仅警告（不 fail）：
 *   5. 去掉 locale 后缀后 stem 仍含 `.` 的文件 —— dot parser 会把 `.` 后的部分
 *      当 locale，文件被静默丢弃、页面不存在（历史遗留 14 个，slug 统一迁移
 *      完成前先不阻断）
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fg from "fast-glob";
import matter from "gray-matter";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOCS_DIR =
  process.env.DOCS_DIR || path.resolve(__dirname, "../content/docs");

const files = fg.sync(`${DOCS_DIR.replaceAll("\\", "/")}/**/*.{md,mdx}`, {
  onlyFiles: true,
  dot: false,
});

const errors = [];
const warnings = [];

/** 相对路径展示用 */
const rel = (fp) => path.relative(path.resolve(__dirname, ".."), fp);

/** 解析文件名：{ stem: 去 locale/扩展名后的 stem, locale: "en"|"zh"|null } */
function parseName(fp) {
  const base = path.basename(fp).replace(/\.(md|mdx)$/i, "");
  const m = base.match(/^(.*)\.(en|zh)$/);
  return m ? { stem: m[1], locale: m[2] } : { stem: base, locale: null };
}

const meta = new Map();
for (const fp of files) {
  const { data } = matter(fs.readFileSync(fp, "utf8"));
  meta.set(fp, {
    docId: (data?.docId ?? "").toString().trim(),
    lang: (data?.lang ?? "").toString().trim(),
    ...parseName(fp),
  });
}

// key: dir + stem → { base?, en?, zh? }
const groups = new Map();
for (const fp of files) {
  const m = meta.get(fp);
  const key = `${path.dirname(fp)}/${m.stem}`;
  if (!groups.has(key)) groups.set(key, {});
  groups.get(key)[m.locale ?? "base"] = fp;
}

for (const fp of files) {
  const m = meta.get(fp);

  // 1. docId 必须存在
  if (!m.docId) {
    errors.push(`缺 docId：${rel(fp)}（跑 pnpm docs:sync-cuid 补齐）`);
  }

  // 3. locale 后缀文件必须带匹配的 lang 字段
  if (m.locale && m.lang !== m.locale) {
    errors.push(
      `lang 字段与文件名后缀不符：${rel(fp)}（后缀 .${m.locale}，lang: ${m.lang || "（缺失）"}）`,
    );
  }

  // 5. dot-parser 丢弃风险（警告）
  if (m.stem.includes(".")) {
    warnings.push(
      `stem 含 "."，fumadocs dot parser 会丢弃该文件（页面不存在）：${rel(fp)}`,
    );
  }
}

for (const [key, g] of groups) {
  const members = Object.values(g);
  if (members.length < 2) continue;

  // 2. 同组 docId 必须一致
  const ids = new Set(members.map((fp) => meta.get(fp).docId).filter(Boolean));
  if (ids.size > 1) {
    errors.push(
      `locale 对 docId 不一致：${members.map(rel).join(" ↔ ")}（${[...ids].join(" vs ")}）`,
    );
  }

  // 4. 裸名 + .zh 并存 = slug 冲突
  if (g.base && g.zh) {
    errors.push(
      `裸名文件与 .zh 文件并存（两者都声明 zh，build 会 slug 冲突）：${rel(g.base)} ↔ ${rel(g.zh)}`,
    );
  }
  void key;
}

if (warnings.length) {
  console.log(`[check-docid-pairs] ${warnings.length} 个警告（不阻断）：`);
  for (const w of warnings) console.log(`  ⚠️  ${w}`);
}
if (errors.length) {
  console.error(`[check-docid-pairs] ${errors.length} 个错误：`);
  for (const e of errors) console.error(`  ❌ ${e}`);
  process.exit(1);
}
console.log(
  `[check-docid-pairs] ✅ ${files.length} 个文件通过（docId 齐全、locale 对一致）`,
);
