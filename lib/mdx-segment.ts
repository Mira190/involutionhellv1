import { createHash } from "node:crypto";
import GithubSlugger from "github-slugger";

export interface Segment {
  headingSlug: string | null;
  heading: string | null;
  depth: number | null;
  content: string;
  hash: string;
}

export interface SegmentedMdx {
  frontmatter: string;
  segments: Segment[];
}

export function normalizeForHash(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t\r]+$/g, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

export function hashText(text: string): string {
  return createHash("sha256")
    .update(normalizeForHash(text), "utf8")
    .digest("hex");
}

export function splitFrontmatter(source: string): {
  frontmatter: string;
  body: string;
} {
  const m = source.match(/^(---\r?\n[\s\S]*?\r?\n---)(\r?\n|$)/);
  if (!m) return { frontmatter: "", body: source };
  return { frontmatter: m[1], body: source.slice(m[1].length + m[2].length) };
}

const FENCE_OPEN_RE = /^ {0,3}(`{3,}|~{3,})(.*)$/;
const FENCE_CLOSE_RE = /^ {0,3}(`{3,}|~{3,})[ \t]*$/;
const ATX_RE = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t]*$/;

export interface CodeFence {
  info: string;
  content: string;
  openLine: number;
  closeLine: number;
}

export function extractFences(body: string): CodeFence[] {
  const lines = body.split("\n");
  const fences: CodeFence[] = [];
  let open: {
    char: string;
    len: number;
    info: string;
    openLine: number;
    inner: string[];
  } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (open) {
      const close = line.match(FENCE_CLOSE_RE);
      if (close && close[1][0] === open.char && close[1].length >= open.len) {
        fences.push({
          info: open.info,
          content: open.inner.join("\n"),
          openLine: open.openLine,
          closeLine: i + 1,
        });
        open = null;
      } else {
        open.inner.push(line);
      }
      continue;
    }
    const m = line.match(FENCE_OPEN_RE);
    if (m && !(m[1][0] === "`" && m[2].includes("`"))) {
      open = {
        char: m[1][0],
        len: m[1].length,
        info: m[2].trim(),
        openLine: i + 1,
        inner: [],
      };
    }
  }
  if (open !== null) {
    fences.push({
      info: open.info,
      content: open.inner.join("\n"),
      openLine: open.openLine,
      closeLine: lines.length,
    });
  }
  return fences;
}

function headingText(raw: string | undefined): string {
  if (!raw) return "";
  return raw.replace(/[ \t]+#+[ \t]*$/, "").trim();
}

/**
 * Splits the body on ATX headings only. Setext headings (underlined with
 * `===` / `---`) are deliberately NOT treated as headings: a line-based
 * scanner cannot reliably tell them apart from paragraphs followed by a
 * thematic break, and this corpus does not use them. Headings inside
 * ``` / ~~~ fences (any length >= 3) never split.
 *
 * Segments reassemble losslessly: joining `segments[].content` with "\n"
 * reproduces the body exactly.
 */
export function segmentMdx(source: string): SegmentedMdx {
  const { frontmatter, body } = splitFrontmatter(source);
  const lines = body.split("\n");
  const slugger = new GithubSlugger();
  const segments: Segment[] = [];

  let current: string[] = [];
  let currentHeading: { text: string; depth: number } | null = null;
  let started = false;
  let fence: { char: string; len: number } | null = null;

  const flush = () => {
    if (!started && current.length === 0) return;
    const content = current.join("\n");
    segments.push({
      heading: currentHeading ? currentHeading.text : null,
      depth: currentHeading ? currentHeading.depth : null,
      headingSlug: currentHeading ? slugger.slug(currentHeading.text) : null,
      content,
      hash: hashText(content),
    });
  };

  for (const line of lines) {
    if (fence) {
      current.push(line);
      const close = line.match(FENCE_CLOSE_RE);
      if (close && close[1][0] === fence.char && close[1].length >= fence.len) {
        fence = null;
      }
      continue;
    }
    const open = line.match(FENCE_OPEN_RE);
    if (open && !(open[1][0] === "`" && open[2].includes("`"))) {
      fence = { char: open[1][0], len: open[1].length };
      current.push(line);
      continue;
    }
    const atx = line.match(ATX_RE);
    if (atx) {
      flush();
      started = true;
      currentHeading = { text: headingText(atx[2]), depth: atx[1].length };
      current = [line];
      continue;
    }
    current.push(line);
  }
  flush();

  return { frontmatter, segments };
}
