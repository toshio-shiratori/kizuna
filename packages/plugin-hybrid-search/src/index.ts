import type {
  Plugin,
  StoredChunk,
  SearchQuery,
  SearchResult,
  PluginContext,
  Migration,
} from "@kizuna/core";
import { Database } from "@kizuna/core";
import type BetterSqlite3 from "better-sqlite3";
import {
  type EmbeddingProvider,
  TransformersEmbeddingProvider,
  cosineSimilarity,
  float32ToBuffer,
  bufferToFloat32,
} from "./embedder.js";

export type { EmbeddingProvider } from "./embedder.js";
export { TransformersEmbeddingProvider, cosineSimilarity } from "./embedder.js";

const PLUGIN_NAME = "@kizuna/plugin-hybrid-search";

export interface HybridSearchOptions {
  alpha?: number;
  dimensions?: number;
  model?: string;
  embeddingProvider?: EmbeddingProvider;
}

export function createHybridSearchPlugin(options?: HybridSearchOptions): Plugin {
  const alpha = options?.alpha ?? 0.5;

  let provider: EmbeddingProvider;
  let rawDb: BetterSqlite3.Database;
  let lastQueryEmbedding: Float32Array | null = null;

  return {
    name: PLUGIN_NAME,
    version: "0.1.0",
    description: "Hybrid search combining FTS5 lexical search with vector similarity",

    migrations(): Migration[] {
      return [
        {
          version: 1,
          description: "Create hybrid search embeddings table",
          up: `CREATE TABLE IF NOT EXISTS hybrid_search_embeddings (
            chunk_id INTEGER PRIMARY KEY REFERENCES chunks(id) ON DELETE CASCADE,
            embedding BLOB NOT NULL
          );`,
          down: `DROP TABLE IF EXISTS hybrid_search_embeddings;`,
        },
      ];
    },

    async init(ctx: PluginContext): Promise<void> {
      rawDb = (ctx.db as Database).db;

      provider =
        options?.embeddingProvider ??
        new TransformersEmbeddingProvider({
          model: options?.model,
          dimensions: options?.dimensions,
        });

      ctx.logger.info("Hybrid search plugin initialized", {
        alpha,
        dimensions: provider.dimensions,
      });
    },

    async afterCapture(chunk: StoredChunk, ctx: PluginContext): Promise<void> {
      try {
        const embedding = await provider.embed(chunk.content);
        rawDb
          .prepare(
            "INSERT OR REPLACE INTO hybrid_search_embeddings (chunk_id, embedding) VALUES (?, ?)",
          )
          .run(chunk.id, float32ToBuffer(embedding));
      } catch (err) {
        ctx.logger.error("Failed to store embedding", {
          chunkId: chunk.id,
          error: String(err),
        });
      }
    },

    async beforeSearch(query: SearchQuery, ctx: PluginContext): Promise<SearchQuery> {
      try {
        lastQueryEmbedding = await provider.embed(query.text);
      } catch (err) {
        lastQueryEmbedding = null;
        ctx.logger.error("Failed to embed query", { error: String(err) });
      }
      return query;
    },

    async afterSearch(results: SearchResult[], ctx: PluginContext): Promise<SearchResult[]> {
      if (!lastQueryEmbedding || results.length === 0) {
        lastQueryEmbedding = null;
        return results;
      }

      const queryEmb = lastQueryEmbedding;
      lastQueryEmbedding = null;

      const maxBm25 = Math.max(...results.map((r) => r.score));

      const selectStmt = rawDb.prepare(
        "SELECT embedding FROM hybrid_search_embeddings WHERE chunk_id = ?",
      );

      const reranked = results.map((result) => {
        const row = selectStmt.get(result.chunk.id) as { embedding: Buffer } | undefined;
        if (!row) return result;

        const chunkEmb = bufferToFloat32(row.embedding);
        const vectorScore = cosineSimilarity(queryEmb, chunkEmb);
        const normalizedBm25 = maxBm25 > 0 ? result.score / maxBm25 : 0;
        const hybridScore = alpha * ((vectorScore + 1) / 2) + (1 - alpha) * normalizedBm25;

        return {
          ...result,
          score: hybridScore,
          annotations: {
            ...result.annotations,
            bm25Score: result.score,
            vectorScore,
            hybridScore,
          },
        };
      });

      ctx.logger.debug("Results reranked", { count: reranked.length });
      return reranked.sort((a, b) => b.score - a.score);
    },
  };
}
