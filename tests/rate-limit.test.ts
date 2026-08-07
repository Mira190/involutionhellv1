import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

interface ConstructedLimiter {
  prefix: string;
  requests: number;
  window: string;
}

const constructed: ConstructedLimiter[] = [];
const limitCalls: Array<{ prefix: string; identifier: string }> = [];

vi.mock("@upstash/redis", () => ({
  Redis: class {},
}));

vi.mock("@upstash/ratelimit", () => {
  class FakeRatelimit {
    prefix: string;
    constructor(config: {
      prefix: string;
      limiter: { requests: number; window: string };
    }) {
      this.prefix = config.prefix;
      constructed.push({
        prefix: config.prefix,
        requests: config.limiter.requests,
        window: config.limiter.window,
      });
    }
    static slidingWindow(requests: number, window: string) {
      return { requests, window };
    }
    async limit(identifier: string) {
      limitCalls.push({ prefix: this.prefix, identifier });
      return {
        success: true,
        limit: 10,
        remaining: 9,
        reset: Date.now() + 60_000,
      };
    }
  }
  return { Ratelimit: FakeRatelimit };
});

const UPSTASH_ENV_VARS = [
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "UPSTASH_REDIS_REST_KV_REST_API_URL",
  "UPSTASH_REDIS_REST_KV_REST_API_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
];

let savedEnv: Record<string, string | undefined>;
let savedNodeEnv: string | undefined;

function makeRequest(ip = "1.2.3.4"): Request {
  return new Request("http://localhost/api/test", {
    method: "POST",
    headers: { "x-real-ip": ip },
  });
}

// process.env.NODE_ENV 在 @types/node 里是只读字面量类型，测试要切换生产/开发
// 分支只能经由可写视图赋值
const mutableEnv = process.env as Record<string, string | undefined>;

async function importRateLimit() {
  vi.resetModules();
  return import("@/lib/rate-limit");
}

beforeEach(() => {
  savedEnv = Object.fromEntries(
    UPSTASH_ENV_VARS.map((k) => [k, process.env[k]]),
  );
  savedNodeEnv = process.env.NODE_ENV;
  mutableEnv.NODE_ENV = "test";
  for (const k of UPSTASH_ENV_VARS) delete process.env[k];
  constructed.length = 0;
  limitCalls.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  if (savedNodeEnv === undefined) delete mutableEnv.NODE_ENV;
  else mutableEnv.NODE_ENV = savedNodeEnv;
  vi.restoreAllMocks();
});

describe("degradation without Upstash env", () => {
  it("allows local development requests and marks them skipped", async () => {
    const { limitChat, limitClassify } = await importRateLimit();
    const chat = await limitChat(makeRequest());
    const classify = await limitClassify(makeRequest());
    expect(chat).toMatchObject({ success: true, skipped: true });
    expect(classify).toMatchObject({ success: true, skipped: true });
    expect(constructed).toHaveLength(0);
  });

  it("fails closed in production", async () => {
    mutableEnv.NODE_ENV = "production";
    const { limitClassify, rateLimitResponse } = await importRateLimit();
    const result = await limitClassify(makeRequest());
    expect(result).toMatchObject({
      success: false,
      unavailable: true,
      limit: 0,
      remaining: 0,
    });

    const response = rateLimitResponse(result);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      code: "rate_limit_unavailable",
    });
  });

  it("warns only once per module lifecycle", async () => {
    const { limitChat, limitClassify } = await importRateLimit();
    await limitChat(makeRequest());
    await limitChat(makeRequest());
    await limitClassify(makeRequest());
    const warnings = vi
      .mocked(console.warn)
      .mock.calls.filter(([msg]) => String(msg).includes("[rate-limit]"));
    expect(warnings).toHaveLength(1);
  });
});

describe("key prefix separation with Upstash configured", () => {
  beforeEach(() => {
    process.env.UPSTASH_REDIS_REST_URL = "https://fake.upstash.io";
    process.env.UPSTASH_REDIS_REST_TOKEN = "fake-token";
  });

  it("text chat uses chat:text + chat:daily prefixes with original windows", async () => {
    const { limitChat } = await importRateLimit();
    const result = await limitChat(makeRequest("9.9.9.9"));
    expect(result.success).toBe(true);
    expect(result.skipped).toBeUndefined();
    expect(constructed).toEqual(
      expect.arrayContaining([
        { prefix: "ratelimit:chat:text", requests: 10, window: "60 s" },
        { prefix: "ratelimit:chat:daily", requests: 100, window: "24 h" },
      ]),
    );
    expect(limitCalls).toEqual(
      expect.arrayContaining([
        { prefix: "ratelimit:chat:text", identifier: "9.9.9.9" },
        { prefix: "ratelimit:chat:daily", identifier: "9.9.9.9" },
      ]),
    );
  });

  it("image chat switches to the tighter chat:image prefix", async () => {
    const { limitChat } = await importRateLimit();
    await limitChat(makeRequest(), true);
    expect(constructed).toEqual(
      expect.arrayContaining([
        { prefix: "ratelimit:chat:image", requests: 5, window: "60 s" },
      ]),
    );
    expect(limitCalls.some((c) => c.prefix === "ratelimit:chat:text")).toBe(
      false,
    );
  });

  it("limitClassify uses its own prefix, isolated from chat buckets", async () => {
    const { limitClassify } = await importRateLimit();
    await limitClassify(makeRequest("5.6.7.8"));
    expect(constructed).toEqual([
      { prefix: "ratelimit:classify", requests: 10, window: "60 s" },
    ]);
    expect(limitCalls).toEqual([
      { prefix: "ratelimit:classify", identifier: "5.6.7.8" },
    ]);
  });

  it("caches Ratelimit instances across calls", async () => {
    const { limitClassify } = await importRateLimit();
    await limitClassify(makeRequest());
    await limitClassify(makeRequest());
    expect(constructed).toHaveLength(1);
  });
});
