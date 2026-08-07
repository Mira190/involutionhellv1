import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/ai/models";
import { source } from "@/lib/source";
import { extractTopLevelSections } from "@/lib/classify-sections";
import { limitClassify, rateLimitResponse } from "@/lib/rate-limit";

export const maxDuration = 15;

const REQUEST_MAX_BYTES = 16 * 1024;
const TITLE_MAX_CHARS = 300;
const EXCERPT_MAX_CHARS = 2000;
const MODEL_TIMEOUT_MS = 10_000;

function noSuggestion(outcome: string, error?: unknown): Response {
  console.warn("[classify] no suggestion", {
    outcome,
    error: error instanceof Error ? `${error.name}: ${error.message}` : undefined,
  });
  return Response.json({ slug: null, confidence: 0 });
}

export async function POST(req: Request) {
  const rl = await limitClassify(req);
  if (!rl.success) return rateLimitResponse(rl);

  const declaredLength = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > REQUEST_MAX_BYTES) {
    return Response.json({ error: "Request body too large" }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).byteLength > REQUEST_MAX_BYTES) {
      return Response.json({ error: "Request body too large" }, { status: 413 });
    }
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const title = body?.title;
  const excerpt = body?.excerpt;
  if (typeof title !== "string" || typeof excerpt !== "string") {
    return Response.json(
      { error: "title and excerpt must be strings" },
      { status: 400 },
    );
  }
  if (!title.trim()) {
    return Response.json({ error: "title must not be empty" }, { status: 400 });
  }
  if (title.length > TITLE_MAX_CHARS) {
    return Response.json({ error: "title is too long" }, { status: 400 });
  }

  try {
    const sections = extractTopLevelSections(source.getPageTree("zh"));
    if (sections.length === 0) return noSuggestion("no_sections");

    const slugs = sections.map((s) => s.slug) as [string, ...string[]];
    const schema = z.object({
      slug: z.enum(slugs),
      confidence: z.number().min(0).max(1),
      reason: z.string(),
    });

    const sectionList = sections
      .map((s) => (s.name === s.slug ? s.slug : `${s.slug}（${s.name}）`))
      .join("、");

    const startedAt = Date.now();
    const { object } = await generateObject({
      model: getModel("intern"),
      schema,
      system:
        `你是一个技术社区知识库的投稿分类助手。知识库的顶层栏目有：${sectionList}。` +
        "根据文章标题和内容节选，判断它最适合放进哪个栏目。" +
        "confidence 是 0 到 1 的把握程度，拿不准就给低分。" +
        "reason 用一句简短中文说明理由。",
      prompt: `标题：${title}\n\n内容节选：\n${excerpt.slice(0, EXCERPT_MAX_CHARS)}`,
      abortSignal: AbortSignal.timeout(MODEL_TIMEOUT_MS),
    });

    console.info("[classify] suggestion", {
      outcome: object.confidence >= 0.5 ? "suggested" : "low_confidence",
      slug: object.slug,
      confidence: object.confidence,
      latencyMs: Date.now() - startedAt,
    });

    return Response.json({
      slug: object.slug,
      confidence: object.confidence,
      reason: object.reason.slice(0, 200),
    });
  } catch (error) {
    return noSuggestion(
      error instanceof DOMException && error.name === "TimeoutError"
        ? "provider_timeout"
        : "provider_error",
      error,
    );
  }
}
