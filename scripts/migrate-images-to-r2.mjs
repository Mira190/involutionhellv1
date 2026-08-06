#!/usr/bin/env node
/**
 * 把 content/docs 下 MD(X) 相对引用的本地图片迁移到 R2。
 *
 * 默认 dry-run：只打印 local -> key 报告，不需要任何 R2 环境变量。
 * 显式 APPLY=1 才会上传 / 改写引用 / 删除本地图片。
 */
import fs from "node:fs";
import path from "node:path";
import fg from "fast-glob";
import matter from "gray-matter";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import {
  IMAGE_FILE_EXTS,
  extractImageUrls,
  isRelativePath,
  rewriteImageRefs,
  buildR2Key,
  dedupeFilename,
  contentTypeForExtension,
} from "./lib/image-refs.mjs";

const ROOT = process.cwd();
const DOCS_DIR = path.join(ROOT, "content", "docs");
const APPLY = process.env.APPLY === "1";
const PUBLIC_BASE = (process.env.R2_PUBLIC_URL ?? "").replace(/\/+$/, "");

const REQUIRED_APPLY_ENV = [
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET_NAME",
  "R2_PUBLIC_URL",
];

function rel(p) {
  return path.relative(ROOT, p).split(path.sep).join("/");
}

function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function planFile(file) {
  const raw = fs.readFileSync(file, "utf8");
  const docId = (matter(raw).data?.docId ?? "").toString().trim();
  const dir = path.dirname(file);

  const candidates = [];
  for (const url of extractImageUrls(raw)) {
    if (PUBLIC_BASE && url.startsWith(PUBLIC_BASE)) continue;
    if (!isRelativePath(url)) continue;
    if (!IMAGE_FILE_EXTS.has(path.extname(url).toLowerCase())) continue;
    candidates.push(url);
  }
  if (candidates.length === 0) return null;

  if (!docId) {
    console.warn(
      `[warn] 跳过 ${rel(file)}：frontmatter 缺少 docId（${candidates.length} 张图片未迁移）`,
    );
    return null;
  }

  const usedNames = new Set();
  const uploadsByAbs = new Map();
  const refToKey = new Map();
  for (const url of candidates) {
    const abs = path.resolve(dir, url);
    if (!fs.existsSync(abs)) {
      console.warn(`[warn] ${rel(file)}: 图片不存在，跳过 -> ${url}`);
      continue;
    }
    let upload = uploadsByAbs.get(abs);
    if (!upload) {
      const filename = dedupeFilename(path.basename(abs), usedNames);
      usedNames.add(filename);
      upload = {
        abs,
        key: buildR2Key(docId, filename),
        size: fs.statSync(abs).size,
        contentType: contentTypeForExtension(path.extname(abs)),
      };
      uploadsByAbs.set(abs, upload);
    }
    refToKey.set(url, upload.key);
  }
  if (refToKey.size === 0) return null;

  return { file, raw, uploads: [...uploadsByAbs.values()], refToKey };
}

async function applyPlans(plans) {
  const missing = REQUIRED_APPLY_ENV.filter((k) => !process.env[k]);
  if (missing.length) {
    console.error(`[error] APPLY=1 但缺少环境变量：${missing.join(", ")}`);
    process.exit(1);
  }

  const client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  const failedFiles = [];
  const deletable = new Set();
  const keepLocal = new Set();

  for (const plan of plans) {
    let ok = true;
    for (const upload of plan.uploads) {
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: process.env.R2_BUCKET_NAME,
            Key: upload.key,
            Body: fs.readFileSync(upload.abs),
            ContentType: upload.contentType,
          }),
        );
        console.log(`[uploaded] ${rel(upload.abs)} -> ${upload.key}`);
      } catch (err) {
        console.error(
          `[error] 上传失败 ${rel(upload.abs)} -> ${upload.key}: ${err.message}`,
        );
        ok = false;
        break;
      }
    }

    if (!ok) {
      // 该文档不改写、本地图片保留，失败的文档下次重跑（同 key 覆盖上传，幂等）
      failedFiles.push(plan.file);
      for (const upload of plan.uploads) keepLocal.add(upload.abs);
      continue;
    }

    const replacements = new Map(
      [...plan.refToKey].map(([url, key]) => [url, `${PUBLIC_BASE}/${key}`]),
    );
    fs.writeFileSync(plan.file, rewriteImageRefs(plan.raw, replacements));
    console.log(`[rewritten] ${rel(plan.file)}（${replacements.size} 处引用）`);
    for (const upload of plan.uploads) deletable.add(upload.abs);
  }

  for (const abs of deletable) {
    if (keepLocal.has(abs)) {
      console.warn(`[warn] 保留 ${rel(abs)}：仍被上传失败的文档引用`);
      continue;
    }
    fs.unlinkSync(abs);
    console.log(`[deleted] ${rel(abs)}`);
    const dir = path.dirname(abs);
    if (fs.existsSync(dir) && fs.readdirSync(dir).length === 0) {
      fs.rmdirSync(dir);
    }
  }

  if (failedFiles.length) {
    console.error(
      `\n[error] ${failedFiles.length} 个文档因上传失败未迁移：\n${failedFiles
        .map((f) => `  - ${rel(f)}`)
        .join("\n")}`,
    );
    process.exit(1);
  }
}

async function main() {
  if (!fs.existsSync(DOCS_DIR)) {
    console.error(`Docs dir not found: ${DOCS_DIR}`);
    process.exit(1);
  }

  const files = await fg("content/docs/**/*.{md,mdx}", {
    cwd: ROOT,
    absolute: true,
  });
  const plans = [];
  for (const file of files.sort()) {
    const plan = planFile(file);
    if (plan) plans.push(plan);
  }

  let imageCount = 0;
  let totalBytes = 0;
  for (const plan of plans) {
    console.log(`\n${rel(plan.file)}`);
    for (const upload of plan.uploads) {
      console.log(
        `  ${rel(upload.abs)} -> ${upload.key} (${formatBytes(upload.size)})`,
      );
      imageCount++;
      totalBytes += upload.size;
    }
  }

  console.log(
    `\n共 ${plans.length} 个文档、${imageCount} 张图片、合计 ${formatBytes(totalBytes)}（${totalBytes} bytes）`,
  );

  if (!APPLY) {
    console.log("Dry run（默认）：未上传、未改写。执行迁移请设 APPLY=1。");
    return;
  }
  await applyPlans(plans);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
