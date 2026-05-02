const CJK_RANGES: [number, number][] = [
  [0x3040, 0x309f], // Hiragana
  [0x30a0, 0x30ff], // Katakana
  [0x4e00, 0x9fff], // CJK Unified Ideographs
  [0x3400, 0x4dbf], // CJK Unified Ideographs Extension A
  [0xff00, 0xffef], // Halfwidth and Fullwidth Forms
  [0x3000, 0x303f], // CJK Symbols and Punctuation
];

export function isCJKChar(char: string): boolean {
  const code = char.codePointAt(0);
  if (code === undefined) return false;
  return CJK_RANGES.some(([lo, hi]) => code >= lo && code <= hi);
}

interface Segment {
  text: string;
  cjk: boolean;
}

export function splitByCJK(text: string): Segment[] {
  const segments: Segment[] = [];
  let current = "";
  let currentIsCJK: boolean | null = null;

  for (const char of text) {
    const charIsCJK = isCJKChar(char);
    if (currentIsCJK !== null && charIsCJK !== currentIsCJK) {
      segments.push({ text: current, cjk: currentIsCJK });
      current = "";
    }
    current += char;
    currentIsCJK = charIsCJK;
  }
  if (current.length > 0 && currentIsCJK !== null) {
    segments.push({ text: current, cjk: currentIsCJK });
  }

  return segments;
}

function generateTrigrams(text: string): string[] {
  const chars = [...text];
  if (chars.length < 3) return [];
  const trigrams: string[] = [];
  for (let i = 0; i <= chars.length - 3; i++) {
    trigrams.push(chars.slice(i, i + 3).join(""));
  }
  return trigrams;
}

function escapeForFts(text: string): string {
  return `"${text.replace(/"/g, '""')}"`;
}

export function preprocessQuery(query: string): string {
  const trimmed = query.trim();
  if (trimmed.length === 0) return "";

  const segments = splitByCJK(trimmed);
  const parts: string[] = [];

  for (const segment of segments) {
    if (!segment.cjk) {
      const words = segment.text
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0);
      for (const word of words) {
        parts.push(escapeForFts(word));
      }
      continue;
    }

    const trigrams = generateTrigrams(segment.text);
    if (trigrams.length > 0) {
      parts.push(trigrams.map(escapeForFts).join(" OR "));
    } else if (segment.text.length > 0) {
      parts.push(escapeForFts(segment.text));
    }
  }

  return parts.join(" ");
}
