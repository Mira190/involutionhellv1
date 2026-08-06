import { describe, expect, it } from "vitest";
import {
  parseLogEntry,
  isExcludedCommit,
  toDateString,
} from "../scripts/generate-doc-dates.mjs";

describe("parseLogEntry", () => {
  it("parses timestamp, author and subject", () => {
    expect(
      parseLogEntry("1778078031|Siz Long|refactor(i18n): docs SSG"),
    ).toEqual({
      timestamp: 1778078031,
      author: "Siz Long",
      subject: "refactor(i18n): docs SSG",
    });
  });

  it("keeps pipes inside the subject", () => {
    expect(parseLogEntry("100|alice|feat: a | b | c")?.subject).toBe(
      "feat: a | b | c",
    );
  });

  it("rejects malformed lines", () => {
    expect(parseLogEntry("")).toBeNull();
    expect(parseLogEntry("not-a-timestamp|a|b")).toBeNull();
    expect(parseLogEntry("12345")).toBeNull();
  });
});

describe("isExcludedCommit", () => {
  it("drops bot authors", () => {
    expect(
      isExcludedCommit({ author: "github-actions[bot]", subject: "feat: x" }),
    ).toBe(true);
  });

  it("drops [skip ci] subjects", () => {
    expect(
      isExcludedCommit({ author: "alice", subject: "chore: sync [skip ci]" }),
    ).toBe(true);
  });

  it("keeps normal human commits", () => {
    expect(isExcludedCommit({ author: "alice", subject: "feat: x" })).toBe(
      false,
    );
  });
});

describe("toDateString", () => {
  it("formats unix seconds as UTC YYYY-MM-DD", () => {
    expect(toDateString(1778078031)).toBe("2026-05-06");
  });
});
