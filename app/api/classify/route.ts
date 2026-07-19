import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "@/lib/ai/models";
import { source } from "@/lib/source";
import { extractTopLevelSections } from "@/lib/classify-sections";
import { limitClassify, rateLimitResponse } from "@/lib/rate-limit";

export const maxDuration = 15;

const EXCERPT_MAX_CHARS = 2000;
const MODEL_TIMEOUT_MS = 10_000;

function noSuggestion(): Response {
  return Response.json({ slug: null, confidence: 0 });
}

export async function POST(req: Request) {
  const rl = await limitClassify(req);
  if (!rl.success) return rateLimitResponse(rl);

  let title: unknown;
  let excerpt: unknown;
  try {
    const body = (await req.json()) as Record<string, unknown>;
    title = body?.title;
    excerpt = body?.excerpt;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  if (typeof title !== "string" || typeof excerpt !== "string") {
    return Response.json(
      { error: "title and excerpt must be strings" },
      { status: 400 },
    );
  }

  // 分类是纯锦上添花的建议：模型/解析/超时任何失败都静默降级为无建议，
  // 绝不因此给表单返回 5xx
  try {
    const sections = extractTopLevelSections(source.getPageTree("zh"));
    if (sections.length === 0) return noSuggestion();

    const slugs = sections.map((s) => s.slug) as [string, ...string[]];
    const schema = z.object({
      slug: z.enum(slugs),
      confidence: z.number().min(0).max(1),
      reason: z.string(),
    });

    const sectionList = sections
      .map((s) => (s.name === s.slug ? s.slug : `${s.slug}（${s.name}）`))
      .join("、");

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

    return Response.json({
      slug: object.slug,
      confidence: object.confidence,
      reason: object.reason.slice(0, 200),
    });
  } catch {
    return noSuggestion();
  }
}
