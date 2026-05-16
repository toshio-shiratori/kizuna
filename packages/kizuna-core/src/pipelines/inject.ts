import type { Database } from "../storage/database.js";
import type { SearchQuery, SearchResult, ContextInjection, ContextBlock } from "../index.js";
import type { PluginManager } from "../plugin/plugin-manager.js";
import { PIPELINE_DEFAULTS } from "../config/defaults.js";
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
const ATTRIBUTION_INSTRUCTION =
  "\n---\nIf any of the above memories are relevant to your current task, verify whether they indicate cross-repo dependencies, deployment constraints, or past design decisions that should inform your approach. Briefly note which memories you considered at the end of your reply.\n";

const HEADER_TOKENS = estimateTokens(HEADER);
const SEPARATOR_TOKENS = estimateTokens(SEPARATOR);
const ATTRIBUTION_TOKENS = estimateTokens(ATTRIBUTION_INSTRUCTION);

function formatChunkBlock(result: SearchResult): string {
  const { chunk, annotations } = result;
  const date = chunk.createdAt.split("T")[0];
  const source = annotations?.source;
  const suffix =
    typeof source === "string" && source.length > 0 && source !== "local"
      ? ` (from: ${source})`
      : "";
  return `### [${date}] ${chunk.role}${suffix}\n\n${chunk.content}\n`;
}

export function formatContext(results: SearchResult[], tokenBudget: number): InjectResult {
  if (results.length === 0) {
    return { context: "", chunksUsed: 0, tokensUsed: 0 };
  }

  if (HEADER_TOKENS > tokenBudget) {
    return { context: "", chunksUsed: 0, tokensUsed: 0 };
  }

  const blocks: string[] = [];
  let tokensUsed = HEADER_TOKENS;
  let chunksUsed = 0;

  for (const result of results) {
    const block = formatChunkBlock(result);
    const separatorCost = chunksUsed > 0 ? SEPARATOR_TOKENS : 0;
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

  const baseContext = HEADER + blocks.join(SEPARATOR);
  if (tokensUsed + ATTRIBUTION_TOKENS <= tokenBudget) {
    return {
      context: baseContext + ATTRIBUTION_INSTRUCTION,
      chunksUsed,
      tokensUsed: tokensUsed + ATTRIBUTION_TOKENS,
    };
  }

  return { context: baseContext, chunksUsed, tokensUsed };
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
  const {
    tokenBudget = PIPELINE_DEFAULTS.tokenBudget,
    maxResults = PIPELINE_DEFAULTS.maxResults,
    halfLifeDays = PIPELINE_DEFAULTS.halfLifeDays,
    pluginManager,
  } = options;

  if (userPrompt.trim().length === 0) {
    return { context: "", chunksUsed: 0, tokensUsed: 0 };
  }

  const reservedTokens = pluginManager ? pluginManager.scaleTokenBudgets(tokenBudget) : 0;

  const chunkBudget = tokenBudget - reservedTokens;

  const query: SearchQuery = {
    text: userPrompt,
    limit: maxResults,
  };

  const results = await searchMemory(db, query, { halfLifeDays, pluginManager });
  const formatted = formatContext(results, chunkBudget);

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
      const pluginBudget = tokenBudget - formatted.tokensUsed;
      if (extraTokens <= pluginBudget) {
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
