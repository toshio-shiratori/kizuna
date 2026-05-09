import type { Database } from "../storage/database.js";
import type { SearchQuery, SearchResult, ContextInjection, ContextBlock } from "../index.js";
import type { PluginManager } from "../plugin/plugin-manager.js";
import { searchMemory } from "./search.js";
import { estimateTokens } from "./chunker.js";

export interface InjectOptions {
  tokenBudget?: number;
  maxResults?: number;
  halfLifeDays?: number;
  pluginManager?: PluginManager;
}

export interface InjectResult {
  context: string;
  chunksUsed: number;
  tokensUsed: number;
}

const HEADER = "## Relevant Memories\n";
const SEPARATOR = "\n---\n\n";

function formatChunkBlock(result: SearchResult): string {
  const { chunk } = result;
  const date = chunk.createdAt.split("T")[0];
  return `### [${date}] ${chunk.role}\n\n${chunk.content}\n`;
}

export function formatContext(results: SearchResult[], tokenBudget: number): InjectResult {
  if (results.length === 0) {
    return { context: "", chunksUsed: 0, tokensUsed: 0 };
  }

  const headerTokens = estimateTokens(HEADER);
  if (headerTokens > tokenBudget) {
    return { context: "", chunksUsed: 0, tokensUsed: 0 };
  }

  const blocks: string[] = [];
  let tokensUsed = headerTokens;
  let chunksUsed = 0;

  for (const result of results) {
    const block = formatChunkBlock(result);
    const separatorCost = chunksUsed > 0 ? estimateTokens(SEPARATOR) : 0;
    const blockTokens = estimateTokens(block) + separatorCost;

    if (tokensUsed + blockTokens > tokenBudget) {
      break;
    }

    blocks.push(block);
    tokensUsed += blockTokens;
    chunksUsed++;
  }

  if (chunksUsed === 0) {
    return { context: "", chunksUsed: 0, tokensUsed: 0 };
  }

  const context = HEADER + blocks.join(SEPARATOR);
  return { context, chunksUsed, tokensUsed };
}

function formatContextBlocks(blocks: ContextBlock[]): string {
  if (blocks.length === 0) return "";

  const sorted = [...blocks].sort((a, b) => b.priority - a.priority);
  return sorted.map((b) => b.content).join("\n\n");
}

export async function injectMemory(
  db: Database,
  userPrompt: string,
  options: InjectOptions = {},
): Promise<InjectResult> {
  const { tokenBudget = 2000, maxResults = 10, halfLifeDays = 30, pluginManager } = options;

  if (userPrompt.trim().length === 0) {
    return { context: "", chunksUsed: 0, tokensUsed: 0 };
  }

  const query: SearchQuery = {
    text: userPrompt,
    limit: maxResults,
  };

  const results = await searchMemory(db, query, { halfLifeDays, pluginManager });
  const formatted = formatContext(results, tokenBudget);

  if (pluginManager) {
    const injection: ContextInjection = {
      userPrompt,
      chunks: results,
      contextBlocks: [],
    };

    const enriched = await pluginManager.runEnrichContext(injection);

    if (enriched.contextBlocks.length > 0) {
      const extraContent = formatContextBlocks(enriched.contextBlocks);
      const extraTokens = estimateTokens(extraContent);
      if (formatted.tokensUsed + extraTokens <= tokenBudget) {
        return {
          context: formatted.context ? `${formatted.context}\n\n${extraContent}` : extraContent,
          chunksUsed: formatted.chunksUsed,
          tokensUsed: formatted.tokensUsed + extraTokens,
        };
      }
    }
  }

  return formatted;
}
