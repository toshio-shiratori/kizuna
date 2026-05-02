import type { RawChunk } from "../index.js";
import type { ParsedTurn } from "./transcript-parser.js";

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
    // CJK characters count as ~2 tokens; ASCII words average ~0.75 tokens per 4 chars
    count += code > 0x2e80 ? 2 : 0.25;
  }
  return Math.max(1, Math.ceil(count));
}
