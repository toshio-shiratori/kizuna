import type { RawChunk } from "../index.js";
import type { ParsedTurn } from "./transcript-parser.js";

export const MIN_CONTENT_LENGTH = 10;

const SKILL_DEFINITION_PATTERN =
  /^---\s*\nname:\s*.+\ndescription:\s*.+\n---\s*\n\n## When to Use/m;

const BOILERPLATE_PATTERNS: RegExp[] = [
  /^セッション(開始|終了)(チェック|処理)を(実行|開始)します。?$/,
  /^Kizuna の(記憶|セットアップ状況)を確認します。?$/,
  /^\[Request interrupted by user\]$/,
];

export function isLowQualityContent(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length < MIN_CONTENT_LENGTH) return true;
  if (BOILERPLATE_PATTERNS.some((p) => p.test(trimmed))) return true;
  if (SKILL_DEFINITION_PATTERN.test(trimmed)) return true;
  return false;
}

export function chunkifyTurns(
  sessionId: string,
  turns: ParsedTurn[],
): (RawChunk & { tokenCount: number })[] {
  return turns.map((turn, index) => ({
    sessionId,
    turnIndex: index,
    role: turn.role,
    content: turn.text,
    tokenCount: estimateTokens(turn.text),
    metadata: {
      uuid: turn.uuid,
      timestamp: turn.timestamp,
    },
  }));
}

export function estimateTokens(text: string): number {
  const len = text.length;
  let count = 0;
  for (let i = 0; i < len; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < len) {
      i++;
      count += 2;
    } else {
      count += code > 0x2e80 ? 2 : 0.25;
    }
  }
  return Math.max(1, Math.ceil(count));
}
