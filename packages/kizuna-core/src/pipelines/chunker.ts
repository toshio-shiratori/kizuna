import type { RawChunk } from "../index.js";
import type { ParsedTurn } from "./transcript-parser.js";

export const MIN_CONTENT_LENGTH = 10;

const BOILERPLATE_PATTERNS: RegExp[] = [
  /^セッション(開始|終了)(チェック|処理)を(実行|開始)します。?$/,
  /^Kizuna の(記憶|セットアップ状況)を確認します。?$/,
  /^\[Request interrupted by user\]$/,
];

export function isLowQualityContent(content: string): boolean {
  const trimmed = content.trim();
  if (trimmed.length < MIN_CONTENT_LENGTH) return true;
  return BOILERPLATE_PATTERNS.some((p) => p.test(trimmed));
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
  let count = 0;
  for (const char of text) {
    const code = char.codePointAt(0)!;
    count += code > 0x2e80 ? 2 : 0.25;
  }
  return Math.max(1, Math.ceil(count));
}
