import { describe, expect, it } from "vitest";
import { estimateReadingMinutes } from "@/lib/reading-time";

describe("estimateReadingMinutes", () => {
  it("counts CJK-only text at 400 chars per minute", () => {
    expect(estimateReadingMinutes("汉".repeat(800))).toBe(2);
  });

  it("counts latin-only text at 200 words per minute", () => {
    expect(estimateReadingMinutes("word ".repeat(400))).toBe(2);
  });

  it("sums CJK and latin contributions in mixed text", () => {
    const mixed = `${"汉".repeat(400)} ${"word ".repeat(200)}`;
    expect(estimateReadingMinutes(mixed)).toBe(2);
  });

  it("weights code fences at 50%", () => {
    const doc = [
      "汉".repeat(400),
      "```ts",
      "token ".repeat(800).trim(),
      "```",
    ].join("\n");
    expect(estimateReadingMinutes(doc)).toBe(3);
  });

  it("handles an unclosed code fence", () => {
    const doc = `${"汉".repeat(800)}\n\`\`\`\n${"token ".repeat(400).trim()}`;
    expect(estimateReadingMinutes(doc)).toBe(3);
  });

  it("returns at least 1 minute for short or empty text", () => {
    expect(estimateReadingMinutes("")).toBe(1);
    expect(estimateReadingMinutes("短文 short text")).toBe(1);
  });
});
