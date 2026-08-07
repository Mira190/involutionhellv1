import { describe, expect, it, vi } from "vitest";
import { createAnthropicProvider } from "../scripts/lib/translate-provider.mjs";

describe("createAnthropicProvider", () => {
  it("bounds output and attaches a request timeout", async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL, _init?: RequestInit) =>
        Response.json({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "translated" }],
        }),
    );
    const provider = createAnthropicProvider({
      apiKey: "test-key",
      model: "test-model",
      requestTimeoutMs: 1234,
      fetchImpl,
    });

    await expect(provider.translate({ text: "source" })).resolves.toBe(
      "translated",
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, init] = fetchImpl.mock.calls[0];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(String(init?.body));
    expect(body.max_tokens).toBe(8000);
    expect(body.model).toBe("test-model");
  });

  it("rejects invalid timeout configuration", () => {
    expect(() =>
      createAnthropicProvider({
        apiKey: "test-key",
        model: "test-model",
        requestTimeoutMs: 0,
      }),
    ).toThrow(/requestTimeoutMs/);
  });
});
