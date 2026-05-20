import type { Plugin, RawChunk, PluginContext } from "@kizuna/core";
import { type RedactionPattern, compilePatterns } from "./patterns.js";

export type { RedactionPattern } from "./patterns.js";
export { DEFAULT_PATTERNS, compilePatterns } from "./patterns.js";

export interface PiiSanitizerOptions {
  customPatterns?: Array<{ name: string; pattern: string; flags?: string }>;
}

export interface PiiSanitizerStats {
  totalRedacted: number;
  byPattern: Record<string, number>;
  lastRedactedAt: string;
  sessionsWithRedactions: number;
}

export const STATS_KEY = "stats";

export function redactContent(
  content: string,
  patterns: readonly RedactionPattern[],
): {
  content: string;
  redactedCount: number;
  redactedTypes: string[];
  redactedByPattern: Record<string, number>;
} {
  let result = content;
  const redactedTypes: string[] = [];
  const redactedByPattern: Record<string, number> = {};
  let redactedCount = 0;

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    const matches = result.match(regex);
    if (matches) {
      result = result.replace(regex, `[REDACTED:${pattern.name}]`);
      redactedTypes.push(pattern.name);
      redactedByPattern[pattern.name] = matches.length;
      redactedCount += matches.length;
    }
  }

  return { content: result, redactedCount, redactedTypes, redactedByPattern };
}

const SESSION_KEY_PREFIX = "session:";

async function updateStats(
  ctx: PluginContext,
  sessionId: string,
  redactedCount: number,
  redactedByPattern: Record<string, number>,
): Promise<void> {
  const existing = await ctx.storage.get<PiiSanitizerStats>(STATS_KEY);
  const stats: PiiSanitizerStats = existing ?? {
    totalRedacted: 0,
    byPattern: {},
    lastRedactedAt: "",
    sessionsWithRedactions: 0,
  };

  stats.totalRedacted += redactedCount;
  for (const [type, count] of Object.entries(redactedByPattern)) {
    stats.byPattern[type] = (stats.byPattern[type] ?? 0) + count;
  }
  stats.lastRedactedAt = new Date().toISOString();

  const sessionKey = `${SESSION_KEY_PREFIX}${sessionId}`;
  const seenSession = await ctx.storage.get<boolean>(sessionKey);
  if (!seenSession) {
    stats.sessionsWithRedactions += 1;
    await ctx.storage.set(sessionKey, true);
  }

  await ctx.storage.set(STATS_KEY, stats);
}

export const PLUGIN_NAME = "@kizuna/plugin-pii-sanitizer";

export const piiSanitizer: Plugin = {
  name: PLUGIN_NAME,
  version: "0.0.0",
  description: "Redacts API keys, tokens, and secrets before storage",

  async beforeCapture(chunk: RawChunk, ctx: PluginContext): Promise<RawChunk | null> {
    const options = ctx.config.options as PiiSanitizerOptions;
    const patterns = compilePatterns(options.customPatterns);

    const { content, redactedCount, redactedTypes, redactedByPattern } = redactContent(
      chunk.content,
      patterns,
    );

    if (redactedCount > 0) {
      ctx.logger.info("Redacted PII", { redactedCount, redactedTypes });
      await updateStats(ctx, chunk.sessionId, redactedCount, redactedByPattern);
      return {
        ...chunk,
        content,
        metadata: {
          ...chunk.metadata,
          [PLUGIN_NAME]: { redactedCount, redactedTypes },
        },
      };
    }

    return chunk;
  },
};
