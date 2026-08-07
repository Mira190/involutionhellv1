/**
 * 基于 Upstash Redis 的分布式 rate limiter，专门给 AI 相关 API 用。
 *
 * 生产环境缺少 Upstash 配置时 fail closed，避免公开 AI 端点在没有成本保护的
 * 情况下继续调用模型。本地开发则保留零配置启动能力，并明确标记为 skipped。
 */
import { Ratelimit, type Duration } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

let hasWarnedMissingUpstash = false;

function firstEnv(...names: string[]): string | undefined {
  for (const n of names) {
    const v = process.env[n];
    if (v && v.trim()) return v;
  }
  return undefined;
}

function getRedis(): Redis | null {
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
  /** Local development only: no distributed limiter was configured. */
  skipped?: boolean;
  /** Production safety state: the limiter is unavailable, so AI calls are denied. */
  unavailable?: boolean;
}

function missingLimiterResult(): RateLimitResult {
  const production = process.env.NODE_ENV === "production";
  if (!hasWarnedMissingUpstash) {
    hasWarnedMissingUpstash = true;
    console.warn(
      production
        ? "[rate-limit] Upstash is not configured in production; AI endpoints are failing closed."
        : "[rate-limit] Upstash is not configured; rate limiting is skipped for local development.",
    );
  }

  if (production) {
    return {
      success: false,
      limit: 0,
      remaining: 0,
      reset: Date.now() + 60_000,
      unavailable: true,
    };
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
    if (!limiter) return missingLimiterResult();
    const res = await limiter.limit(getClientIp(req));
    return {
      success: res.success,
      limit: res.limit,
      remaining: res.remaining,
      reset: res.reset,
    };
  };
}

const limitChatText = createLimiter({
  prefix: "ratelimit:chat:text",
  requests: 10,
  window: "60 s",
});

const limitChatImage = createLimiter({
  prefix: "ratelimit:chat:image",
  requests: 5,
  window: "60 s",
});

const limitChatDaily = createLimiter({
  prefix: "ratelimit:chat:daily",
  requests: 100,
  window: "24 h",
});

export const limitClassify = createLimiter({
  prefix: "ratelimit:classify",
  requests: 10,
  window: "60 s",
});

export async function limitChat(
  req: Request,
  hasImage = false,
): Promise<RateLimitResult> {
  const [minuteRes, dayRes] = await Promise.all([
    (hasImage ? limitChatImage : limitChatText)(req),
    limitChatDaily(req),
  ]);

  if (minuteRes.unavailable) return minuteRes;
  if (dayRes.unavailable) return dayRes;
  if (minuteRes.skipped || dayRes.skipped) return missingLimiterResult();
  if (!minuteRes.success) return minuteRes;
  if (!dayRes.success) return dayRes;

  return minuteRes.remaining <= dayRes.remaining ? minuteRes : dayRes;
}

export function rateLimitResponse(result: RateLimitResult): Response {
  if (result.unavailable) {
    return new Response(
      JSON.stringify({
        error: "AI service is temporarily unavailable.",
        code: "rate_limit_unavailable",
        retryAfter: 60,
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": "60",
        },
      },
    );
  }

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
