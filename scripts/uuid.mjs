#!/usr/bin/env node
/**
 * @description 为 docs 目录下的 Markdown/MDX 文档补齐 frontmatter 元信息：
 * - 若缺少 cuid（docId），优先从同 stem 的 locale 兄弟文件（foo.md ↔ foo.en.md /
 *   foo.zh.md）继承 docId —— 翻译对必须共享同一 docId，contributors 统计与
 *   fumadocs 配对都以 docId 为键，随机新 id 会把翻译对永久分叉
 * - 无兄弟可继承时才用 cuid2 生成
 *
 * @note 使用方式：
 *   - 仅补齐 frontmatter：`pnpm docs:sync-cuid`
 *   - 同步数据库：`pnpm docs:sync-cuid -- --sync-db`
 * @author Siz Long
 * @location scripts/uuid.mjs
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fg from "fast-glob";
import matter from "gray-matter";
import { createId, isCuid } from "@paralleldrive/cuid2";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// 默认用脚本自身位置定位仓库根，工作目录无关；可用 DOCS_DIR 环境变量覆盖。
// （旧默认 "../content/docs" 是工作目录相对路径，从仓库根跑会解析到仓库外，
// 扫到 0 个文件静默 no-op。）
const DOCS_DIR =
  process.env.DOCS_DIR || path.resolve(__dirname, "../content/docs");
const GLOBS = [`${DOCS_DIR.replaceAll("\\", "/")}/**/*.{md,mdx,markdown}`];

function log(...args) {
  console.log("[add-doc-ids]", ...args);
}

/**
 * 同 stem 的 locale 兄弟文件候选路径。
 *   foo.en.md  → foo.md / foo.mdx / foo.markdown
 *   foo.zh.md  → 同上
 *   foo.md     → foo.en.* / foo.zh.*
 */
function siblingCandidates(fp) {
  const dir = path.dirname(fp);
  const stem = path.basename(fp).replace(/\.(md|mdx|markdown)$/i, "");
  const m = stem.match(/^(.*)\.(en|zh)$/);
  const stems = m ? [m[1]] : [`${stem}.en`, `${stem}.zh`];
  const exts = ["md", "mdx", "markdown"];
  const out = [];
  for (const s of stems) {
    for (const e of exts) out.push(path.join(dir, `${s}.${e}`));
  }
  return out;
}

/**
 * Surgical 插入 docId 行：只在 frontmatter 末尾加一行，其余字节不动。
 *
 * 不用 gray-matter stringify 写回：js-yaml round-trip 会重排引号、把未加
 * 引号的 ISO 日期改写成 Date 序列化形式、折叠长字符串（>-），一次跑全库
 * 会产生几百行无意义 diff（generate-descriptions.mjs 同款约束）。
 */
function insertDocIdLine(raw, id) {
  const fmMatch = raw.match(/^(---\r?\n)([\s\S]*?)(\r?\n---\r?\n?)/);
  const line = `docId: ${id}`;
  if (!fmMatch) {
    return `---\n${line}\n---\n\n${raw}`;
  }
  const [full, open, body, close] = fmMatch;
  return open + body + `\n${line}` + close + raw.slice(full.length);
}

async function main() {
  const files = await fg(GLOBS, { onlyFiles: true, dot: false });
  if (files.length === 0) {
    log(`未找到文档文件：${DOCS_DIR}`);
    return;
  }

  // 先收集已有 docId：既做碰撞检测，也做兄弟继承的查询表
  const existingIds = new Set();
  const idByFile = new Map();
  const warnings = [];

  for (const fp of files) {
    const raw = await fs.readFile(fp, "utf8");
    const fm = matter(raw);
    const id = (fm.data?.docId ?? "").toString().trim();
    if (!id) continue;

    // 校验已存在的 docId 是否为合法 CUID；不合法则仅警告
    if (!isCuid(id)) {
      warnings.push(`⚠️ 非法 docId（非 CUID）：${fp}  ->  docId="${id}"`);
      // 依然将其加入集合，避免后续生成的 id 与之重复（尽管概率极低）
    }
    existingIds.add(id);
    idByFile.set(path.resolve(fp), id);
  }

  // 对缺失 docId 的文件进行补写
  let updated = 0;
  let inherited = 0;
  let skipped = 0;

  for (const fp of files) {
    const raw = await fs.readFile(fp, "utf8");
    const parsed = matter(raw);
    const id = (parsed.data?.docId ?? "").toString().trim();

    if (id) {
      // 已有 docId：跳过，不改动
      skipped++;
      continue;
    }

    // 先找 locale 兄弟继承，找不到再生成新 cuid2
    let newId = null;
    let fromSibling = false;
    for (const cand of siblingCandidates(fp)) {
      const sibId = idByFile.get(path.resolve(cand));
      if (sibId) {
        newId = sibId;
        fromSibling = true;
        inherited++;
        break;
      }
    }
    if (!newId) {
      do {
        newId = createId();
      } while (existingIds.has(newId));
      existingIds.add(newId);
    }
    idByFile.set(path.resolve(fp), newId);

    await fs.writeFile(fp, insertDocIdLine(raw, newId), "utf8");
    updated++;

    log(
      `已补充 docId：${path.relative(process.cwd(), fp)}  ->  ${newId}${fromSibling ? "（继承自 locale 兄弟）" : "（新生成）"}`,
    );
  }

  // 输出警告与汇总
  if (warnings.length) {
    log("==== 警告（已存在但不是合法 CUID 的 docId，未做修改） ====");
    for (const w of warnings) log(w);
  }
  log(
    `处理完成：新增 ${updated} 个 docId（其中 ${inherited} 个继承自 locale 兄弟），跳过 ${skipped} 个已有文档，总计 ${files.length} 个文件。`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
