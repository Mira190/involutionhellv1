/**
 * 基于 Upstash Redis 的分布式 rate limiter，专门给 AI 相关 API 用。
 *
 * 背景：免费模型 GLM-4.6V-Flash 并发上限很低（≈ 5），单个用户开几个 tab
 * 就能打爆。必须 per-IP 滑动窗口限流，阻止一个访客拖垮整个站点。
 *
 * 环境变量缺失时自动降级为"不限流 + 打 warn"：允许本地 dev 零配置启动，
 * 但生产必须配齐 UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN。
 *
 * 使用：
 *   const result = await limitChat(req);
 *   if (!result.success) return rateLimitResponse(result);
 */
import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// Upstash env 缺失的 warn 只在模块生命周期内打一次，
// 避免生产环境每请求刷爆 serverless 日志
let hasWarnedMissingUpstash = false;

/**
 * 挑第一个非空 env var 返回；本地开发 + Vercel 不同集成版本的命名差异靠它兜住。
 */
function firstEnv(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v;
  }
  return undefined;
}

function getRedis(): Redis | null {
  // Upstash 的 env 名字在不同集成路径下会长得不一样：
  //   - 手动从 Upstash 控制台复制       → UPSTASH_REDIS_REST_URL / _TOKEN
  //   - Vercel 集成、无自定义 prefix    → KV_REST_API_URL / KV_REST_API_TOKEN
  //   - Vercel 集成、prefix=UPSTASH_... → UPSTASH_REDIS_REST_KV_REST_API_URL ...
  // 按上面优先级依次查找，读到谁用谁，免得跟集成命名斗智斗勇。
  const url = firstEnv(
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_KV_REST_API_URL",
    "KV_REST_API_URL",
  );
  const token = firstEnv(
    "UPSTASH_REDIS_REST_TOKEN",
    "UPSTASH_REDIS_REST_KV_REST_API_TOKEN",
    "KV_REST_API_TOKEN",
  );
  if (!url || !token) return null;
  return new Redis({ url, token });
}

/**
 * 从 request headers 里提取客户端 IP。
 *
 * 防伪造：
 * - 优先读 `x-real-ip`：Vercel/多数 CDN 只写由自己验证过的真实客户端 IP，
 *   不会把客户端伪造的值透传进来，最可信。
 * - 没有 `x-real-ip` 时才降级到 `x-forwarded-for`；但不能取 XFF 的 **第一个**，
 *   因为那是客户端可以随便伪造的值；应该取 **最后一个非空项**，也就是最内层
 *   可信代理看到的实际来源地址。
 * - 都没有（本地 dev）时用固定字符串，所有请求共享一个额度桶，避免本地爆测。
 */
function getClientIp(req: Request): string {
  const xri = req.headers.get("x-real-ip");
  if (xri && xri.trim()) return xri.trim();

  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff
      .split(",")
      .map((ip) => ip.trim())
      .filter(Boolean);
    if (parts.length > 0) return parts[parts.length - 1];
  }

  return "anonymous";
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  /** Unix ms timestamp when the window resets */
  reset: number;
  /** 当 Upstash 未配置时，此字段为 true，调用方应跳过限流 */
  skipped?: boolean;
}

function skippedResult(): RateLimitResult {
  if (!hasWarnedMissingUpstash) {
    hasWarnedMissingUpstash = true;
    console.warn(
      "[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN 未配置，" +
        "AI 接口暂无限流保护（本实例生命周期内不会再次提示）。" +
        "生产环境请在 Vercel Env 中补齐。",
    );
  }
  return {
    success: true,
    limit: Infinity,
    remaining: Infinity,
    reset: 0,
    skipped: true,
  };
}

export interface LimiterOptions {
  prefix: string;
  requests: number;
  window: Duration;
}

/**
 * per-IP 滑动窗口限流器工厂。Ratelimit 实例按 limiter 单例缓存，
 * 避免每次请求都重建连接；Upstash 未配置时降级为放行 + warn 一次。
 */
export function createLimiter(options: LimiterOptions) {
  let cached: Ratelimit | null = null;

  function getInstance(): Ratelimit | null {
    if (cached) return cached;
    const redis = getRedis();
    if (!redis) return null;
    cached = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(options.requests, options.window),
      analytics: true,
      prefix: options.prefix,
    });
    return cached;
  }

  return async function limit(req: Request): Promise<RateLimitResult> {
    const limiter = getInstance();
    if (!limiter) return skippedResult();
    const res = await limiter.limit(getClientIp(req));
    return {
      success: res.success,
      limit: res.limit,
      remaining: res.remaining,
      reset: res.reset,
    };
  };
}

/** 纯文本聊天：10 req / 60s / IP */
const limitChatText = createLimiter({
  prefix: "ratelimit:chat:text",
  requests: 10,
  window: "60 s",
});

/** 带图聊天：5 req / 60s / IP（图片更贵，收严） */
const limitChatImage = createLimiter({
  prefix: "ratelimit:chat:image",
  requests: 5,
  window: "60 s",
});

/** 日限：100 req / 24h / IP，防长尾刷量 */
const limitChatDaily = createLimiter({
  prefix: "ratelimit:chat:daily",
  requests: 100,
  window: "24 h",
});

/** 投稿分类建议：10 req / 60s / IP */
export const limitClassify = createLimiter({
  prefix: "ratelimit:classify",
  requests: 10,
  window: "60 s",
});

/**
 * 对聊天请求做两层限流：per-minute + per-day，任一维度不过就算失败。
 * @param req  Next.js Request
 * @param hasImage  消息是否携带图片（影响每分钟窗口严格度）
 */
export async function limitChat(
  req: Request,
  hasImage = false,
): Promise<RateLimitResult> {
  const [minuteRes, dayRes] = await Promise.all([
    (hasImage ? limitChatImage : limitChatText)(req),
    limitChatDaily(req),
  ]);

  if (minuteRes.skipped || dayRes.skipped) return skippedResult();
  if (!minuteRes.success) return minuteRes;
  if (!dayRes.success) return dayRes;

  // 取剩余额度较紧的一档回给调用方
  return minuteRes.remaining <= dayRes.remaining ? minuteRes : dayRes;
}

/** 生成 429 响应，带标准 Retry-After 和 X-RateLimit-* 头 */
export function rateLimitResponse(result: RateLimitResult): Response {
  const retryAfterSec = Math.max(
    1,
    Math.ceil((result.reset - Date.now()) / 1000),
  );
  return new Response(
    JSON.stringify({
      error: "请求太频繁了，喘口气再来。",
      code: "rate_limited",
      retryAfter: retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
        "X-RateLimit-Limit": String(result.limit),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(result.reset),
      },
    },
  );
}
