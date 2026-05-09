import type { Plugin, RawChunk, PluginContext } from "@kizuna/core";
import { type RedactionPattern, compilePatterns } from "./patterns.js";

export type { RedactionPattern } from "./patterns.js";
export { DEFAULT_PATTERNS, compilePatterns } from "./patterns.js";

export interface PiiSanitizerOptions {
  customPatterns?: Array<{ name: string; pattern: string; flags?: string }>;
}

export function redactContent(
  content: string,
  patterns: readonly RedactionPattern[],
): { content: string; redactedCount: number; redactedTypes: string[] } {
  let result = content;
  const redactedTypes: string[] = [];
  let redactedCount = 0;

  for (const pattern of patterns) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    const matches = result.match(regex);
    if (matches) {
      result = result.replace(regex, `[REDACTED:${pattern.name}]`);
      redactedTypes.push(pattern.name);
      redactedCount += matches.length;
    }
  }

  return { content: result, redactedCount, redactedTypes };
}

export const piiSanitizer: Plugin = {
  name: "@kizuna/plugin-pii-sanitizer",
  version: "0.0.0",
  description: "Redacts API keys, tokens, and secrets before storage",

  beforeCapture(chunk: RawChunk, ctx: PluginContext): RawChunk | null {
    const options = ctx.config.options as PiiSanitizerOptions;
    const patterns = compilePatterns(options.customPatterns);

    const { content, redactedCount, redactedTypes } = redactContent(chunk.content, patterns);

    if (redactedCount > 0) {
      ctx.logger.info("Redacted PII", { redactedCount, redactedTypes });
      return {
        ...chunk,
        content,
        metadata: {
          ...chunk.metadata,
          "@kizuna/plugin-pii-sanitizer": { redactedCount, redactedTypes },
        },
      };
    }

    return chunk;
  },
};
