import { describe, expect, it } from "vitest";
import {
  shouldCountTranslationCommit,
  TRANSLATION_SYNC_MARKER,
} from "../lib/contribution-credit.ts";

describe("shouldCountTranslationCommit", () => {
  it("counts a normal human fix commit", () => {
    expect(
      shouldCountTranslationCommit({
        isCreation: false,
        authorLogin: "alice",
        authorName: "Alice",
        subject: "fix(en): polish wording in static-array",
      }),
    ).toBe(true);
  });

  it("excludes the file creation commit even for a human author", () => {
    expect(
      shouldCountTranslationCommit({
        isCreation: true,
        authorLogin: "alice",
        authorName: "Alice",
        subject: "feat(seo): translate 32 zh-only docs to en",
      }),
    ).toBe(false);
  });

  it("excludes bot authors by login or name", () => {
    expect(
      shouldCountTranslationCommit({
        isCreation: false,
        authorLogin: "github-actions[bot]",
        authorName: "github-actions",
        subject: "chore: sync",
      }),
    ).toBe(false);
    expect(
      shouldCountTranslationCommit({
        isCreation: false,
        authorLogin: null,
        authorName: "dependabot[bot]",
        subject: "chore: sync",
      }),
    ).toBe(false);
  });

  it("excludes pipeline commits carrying the sync marker", () => {
    expect(
      shouldCountTranslationCommit({
        isCreation: false,
        authorLogin: "alice",
        authorName: "Alice",
        subject: `chore(i18n): 增量翻译同步 ${TRANSLATION_SYNC_MARKER} [skip ci]`,
      }),
    ).toBe(false);
  });

  it("counts commits with missing author metadata as non-bot", () => {
    expect(
      shouldCountTranslationCommit({
        isCreation: false,
        authorLogin: null,
        authorName: null,
        subject: "docs: fix typo",
      }),
    ).toBe(true);
  });
});
