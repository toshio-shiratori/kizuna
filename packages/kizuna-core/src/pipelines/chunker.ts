import type { RawChunk } from "../index.js";
import type { ParsedTurn } from "./transcript-parser.js";
import { PIPELINE_DEFAULTS } from "../config/defaults.js";

export const MIN_CONTENT_LENGTH = PIPELINE_DEFAULTS.minContentLength;

const SKILL_DEFINITION_PATTERNS: RegExp[] = [
  /^---\s*\nname:\s*.+\ndescription:\s*.+\n---\s*\n\n## When to Use/m,
  /^## When to Use\n[\s\S]*?## Steps\n/m,
  /^## When to Use\n[\s\S]*?## How to Use/m,
  /^## Autonomy\n[\s\S]*?## Steps\n/,
  /^## (?:Input|Steps)\n[\s\S]*?## Autonomy\n/,
  /^## Steps\n[\s\S]*?## Decision Rules\n/,
];

const CONTINUATION_PATTERNS: RegExp[] = [
  /^This session is being continued from a previous conversation/m,
];

const BOILERPLATE_PATTERNS: RegExp[] = [
  /^セッション(開始|終了)(チェック|処理)を(実行|開始)します。?$/,
  /^Kizuna の(記憶|セットアップ状況)を確認します。?$/,
  /^\[Request interrupted( by user)?\]$/,
  /^Session (start|end) (check|processing)\.?$/i,
  /^Checking (Kizuna )?(memories|setup|session status)\.?$/i,
  /^Running session (start|end) (check|hook)\.?$/i,
];

function matchesUserPattern(content: string, pattern: string): boolean {
  if (pattern.startsWith("^")) {
    try {
      return new RegExp(pattern).test(content);
    } catch {
      console.warn(`kizuna: invalid noise pattern regex: ${pattern}`);
      return false;
    }
  }
  return content.includes(pattern);
}

export function isLowQualityContent(content: string, userPatterns?: readonly string[]): boolean {
  const trimmed = content.trim();
  if (trimmed.length < MIN_CONTENT_LENGTH) return true;
  if (BOILERPLATE_PATTERNS.some((p) => p.test(trimmed))) return true;
  if (SKILL_DEFINITION_PATTERNS.some((p) => p.test(trimmed))) return true;
  if (CONTINUATION_PATTERNS.some((p) => p.test(trimmed))) return true;
  if (userPatterns && userPatterns.length > 0) {
    if (userPatterns.some((p) => matchesUserPattern(trimmed, p))) return true;
  }
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

const TRUNCATION_MARKER = "\n\n[truncated]";

/**
 * Truncates content to fit within a byte limit (UTF-8).
 * Cuts at character boundaries to avoid breaking multi-byte characters.
 * Appends a truncation marker if the content was truncated.
 *
 * @param content - The content to truncate
 * @param maxBytes - Maximum size in bytes (UTF-8). The marker is included in this budget.
 * @returns The original content if within limit, or truncated content with marker
 */
export function truncateChunk(content: string, maxBytes: number): string {
  const encoder = new TextEncoder();
  const contentBytes = encoder.encode(content).byteLength;

  if (contentBytes <= maxBytes) {
    return content;
  }

  const markerBytes = encoder.encode(TRUNCATION_MARKER).byteLength;
  const targetBytes = maxBytes - markerBytes;

  if (targetBytes <= 0) {
    return TRUNCATION_MARKER;
  }

  // Slice at character boundaries by iterating characters
  let byteCount = 0;
  let charEnd = 0;
  for (const char of content) {
    const charBytes = encoder.encode(char).byteLength;
    if (byteCount + charBytes > targetBytes) {
      break;
    }
    byteCount += charBytes;
    charEnd += char.length; // .length handles surrogate pairs (2 for surrogates, 1 otherwise)
  }

  return content.slice(0, charEnd) + TRUNCATION_MARKER;
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
