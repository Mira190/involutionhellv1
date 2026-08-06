const CJK_CHARS_PER_MINUTE = 400;
const LATIN_WORDS_PER_MINUTE = 200;
const CODE_WEIGHT = 0.5;

const CJK_PATTERN = /[⺀-⻿぀-ヿㇰ-ㇿ㐀-䶿一-鿿豈-﫿]/g;
const CODE_FENCE_PATTERN = /```[\s\S]*?(?:```|$)/g;

function rawMinutes(text: string): number {
  const cjkCount = (text.match(CJK_PATTERN) ?? []).length;
  const latinWordCount = text
    .replace(CJK_PATTERN, " ")
    .split(/\s+/)
    .filter((word) => /[A-Za-z0-9]/.test(word)).length;
  return (
    cjkCount / CJK_CHARS_PER_MINUTE + latinWordCount / LATIN_WORDS_PER_MINUTE
  );
}

export function estimateReadingMinutes(markdown: string): number {
  const fences: string[] = [];
  const prose = markdown.replace(CODE_FENCE_PATTERN, (match) => {
    fences.push(match);
    return " ";
  });
  let minutes = rawMinutes(prose);
  for (const fence of fences) {
    minutes += rawMinutes(fence) * CODE_WEIGHT;
  }
  return Math.max(1, Math.round(minutes));
}
