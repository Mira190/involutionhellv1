const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 16000;

const SYSTEM_PROMPT = [
  "You are a professional technical translator for a computer-science and AI community knowledge base.",
  "Translate the Simplified Chinese Markdown/MDX segment in the user message into precise, natural technical English.",
  "",
  "Rules:",
  "- Preserve Markdown structure exactly: heading levels and their leading # characters, list markers, tables, blockquotes, emphasis, and blank lines.",
  "- Placeholder tokens of the form ⟦PH0⟧, ⟦PH1⟧, ... mark protected content (code, math, URLs, JSX/HTML tags, import/export lines). Reproduce every placeholder token exactly as given, each exactly once, at the position where its content belongs. Never translate, drop, duplicate, or invent placeholder tokens. A placeholder that stands alone on a line must stay alone on its own line.",
  "- Use standard English CS/AI terminology; keep proper nouns, product names, and code identifiers unchanged.",
  "- Output only the translated segment. No preamble, no explanations, no code fences around the answer.",
].join("\n");

export class RetryableProviderError extends Error {}

export function createAnthropicProvider({
  apiKey,
  model,
  maxRetries = 2,
  fetchImpl = fetch,
}) {
  if (!apiKey) throw new Error("createAnthropicProvider: apiKey is required");
  if (!model) throw new Error("createAnthropicProvider: model is required");

  async function requestOnce(text) {
    const res = await fetchImpl(API_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: text }],
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const message = `anthropic HTTP ${res.status}: ${body.slice(0, 300)}`;
      const retryable =
        res.status === 408 ||
        res.status === 409 ||
        res.status === 429 ||
        res.status >= 500;
      throw retryable
        ? new RetryableProviderError(message)
        : new Error(message);
    }
    const data = await res.json();
    if (data.stop_reason !== "end_turn") {
      throw new RetryableProviderError(
        `anthropic stop_reason=${data.stop_reason} (expected end_turn)`,
      );
    }
    return data.content
      .filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("");
  }

  return {
    name: "anthropic",
    model,
    async translate({ text }) {
      let lastError;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          return await requestOnce(text);
        } catch (error) {
          lastError = error;
          const retryable =
            error instanceof RetryableProviderError ||
            error instanceof TypeError;
          if (!retryable || attempt === maxRetries) throw error;
          await new Promise((resolve) =>
            setTimeout(resolve, 500 * 2 ** attempt),
          );
        }
      }
      throw lastError;
    },
  };
}

export function createMockProvider({
  dropPlaceholders = 0,
  model = "mock-translator",
} = {}) {
  let remainingDrops = dropPlaceholders;
  return {
    name: "mock",
    model,
    async translate({ text }) {
      let out = text
        .split("\n")
        .map((line) => {
          if (line.trim() === "") return line;
          // Block-level placeholders (fences, $$ math, import lines) must stay
          // standalone or re-segmentation of the restored output breaks.
          if (/^(?:⟦PH\d+⟧\s*)+$/.test(line.trim())) return line;
          const m = line.match(
            /^(\s*(?:#{1,6}[ \t]+|[-*+][ \t]+|\d+\.[ \t]+|>[ \t]?)*)(.*)$/,
          );
          const prefix = m ? m[1] : "";
          const rest = m ? m[2] : line;
          if (rest === "") return line;
          return `${prefix}[en] ${rest}`;
        })
        .join("\n");
      if (remainingDrops > 0) {
        remainingDrops--;
        out = out.replace(/⟦PH\d+⟧/g, "");
      }
      return out;
    },
  };
}
