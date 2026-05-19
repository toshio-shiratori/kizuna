export interface PreprocessedQuery {
  ftsQuery: string;
  likePatterns: string[];
}

export function isCJKChar(char: string): boolean {
  const code = char.codePointAt(0);
  if (code === undefined) return false;
  return (
    (code >= 0x3000 && code <= 0x303f) ||
    (code >= 0x3040 && code <= 0x309f) ||
    (code >= 0x30a0 && code <= 0x30ff) ||
    (code >= 0x3400 && code <= 0x4dbf) ||
    (code >= 0x4e00 && code <= 0x9fff) ||
    (code >= 0xff00 && code <= 0xffef)
  );
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

export function escapeForLike(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

export function preprocessQuery(query: string): PreprocessedQuery {
  const trimmed = query.trim();
  if (trimmed.length === 0) return { ftsQuery: "", likePatterns: [] };

  const segments = splitByCJK(trimmed);
  const ftsParts: string[] = [];
  const likePatterns: string[] = [];

  for (const segment of segments) {
    if (!segment.cjk) {
      const words = segment.text
        .trim()
        .split(/\s+/)
        .filter((w) => w.length > 0);
      for (const word of words) {
        ftsParts.push(escapeForFts(word));
      }
      continue;
    }

    const trigrams = generateTrigrams(segment.text);
    if (trigrams.length > 0) {
      ftsParts.push(trigrams.map(escapeForFts).join(" OR "));
    } else if (segment.text.length > 0) {
      // CJK text shorter than 3 characters: FTS5 trigram can't MATCH these,
      // so use LIKE fallback instead
      likePatterns.push(`%${escapeForLike(segment.text)}%`);
    }
  }

  return { ftsQuery: ftsParts.join(" "), likePatterns };
}
