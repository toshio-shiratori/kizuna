import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { StoredChunk, SearchResult, PluginContext, Logger, SearchQuery } from "@kizuna/core";
import { Database } from "@kizuna/core";
import { cosineSimilarity, float32ToBuffer, bufferToFloat32 } from "./embedder.js";
import type { EmbeddingProvider } from "./embedder.js";
import { createHybridSearchPlugin } from "./index.js";

function simpleHash(text: string): number {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return hash;
}

class MockEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 4;
  embedCount = 0;

  async embed(text: string): Promise<Float32Array> {
    this.embedCount++;
    const hash = simpleHash(text);
    const arr = new Float32Array(this.dimensions);
    for (let i = 0; i < this.dimensions; i++) {
      arr[i] = Math.sin(hash * (i + 1) * 0.1);
    }
    let norm = 0;
    for (let i = 0; i < arr.length; i++) norm += arr[i]! * arr[i]!;
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < arr.length; i++) arr[i]! /= norm;
    }
    return arr;
  }
}

class FailingEmbeddingProvider implements EmbeddingProvider {
  readonly dimensions = 4;
  async embed(): Promise<Float32Array> {
    throw new Error("embedding failed");
  }
}

const noopLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
};

function makeContext(db: Database): PluginContext {
  return {
    db: db.db,
    config: { enabled: true, options: {} },
    projectConfig: { id: "test-project" },
    logger: noopLogger,
    storage: {
      async get() {
        return null;
      },
      async set() {},
      async delete() {},
      async list() {
        return [];
      },
    },
  };
}

function makeStoredChunk(id: number, content: string): StoredChunk {
  return {
    id,
    sessionId: "test-session",
    turnIndex: id,
    role: "assistant",
    content,
    tokenCount: content.length,
    importance: 5,
    createdAt: new Date().toISOString(),
    metadata: {},
  };
}

function makeSearchResult(id: number, content: string, score: number): SearchResult {
  return {
    chunk: makeStoredChunk(id, content),
    score,
  };
}

describe("cosineSimilarity", () => {
  it("returns 1 for identical normalized vectors", () => {
    const a = new Float32Array([1, 0, 0, 0]);
    expect(cosineSimilarity(a, a)).toBeCloseTo(1.0);
  });

  it("returns 0 for orthogonal vectors", () => {
    const a = new Float32Array([1, 0, 0, 0]);
    const b = new Float32Array([0, 1, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(0.0);
  });

  it("returns -1 for opposite vectors", () => {
    const a = new Float32Array([1, 0, 0, 0]);
    const b = new Float32Array([-1, 0, 0, 0]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1.0);
  });

  it("returns 0 for zero vectors", () => {
    const a = new Float32Array([0, 0, 0, 0]);
    const b = new Float32Array([1, 0, 0, 0]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });
});

describe("float32ToBuffer / bufferToFloat32", () => {
  it("roundtrips correctly", () => {
    const original = new Float32Array([1.5, -2.3, 0, 42.0]);
    const buffer = float32ToBuffer(original);
    const result = bufferToFloat32(buffer);
    expect(result.length).toBe(original.length);
    for (let i = 0; i < original.length; i++) {
      expect(result[i]).toBeCloseTo(original[i]!);
    }
  });

  it("preserves precision", () => {
    const original = new Float32Array([Math.PI, Math.E, Number.EPSILON]);
    const result = bufferToFloat32(float32ToBuffer(original));
    for (let i = 0; i < original.length; i++) {
      expect(result[i]).toBe(original[i]);
    }
  });
});

describe("createHybridSearchPlugin", () => {
  let tempDir: string;
  let db: Database;
  let ctx: PluginContext;
  let mockProvider: MockEmbeddingProvider;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "kizuna-hybrid-test-"));
    db = new Database(join(tempDir, "memory.db"));
    ctx = makeContext(db);
    mockProvider = new MockEmbeddingProvider();

    db.insertSession({
      id: "test-session",
      projectId: "test-project",
      startedAt: new Date().toISOString(),
      endedAt: null,
      transcriptPath: null,
      metadata: {},
    });
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("has correct metadata", () => {
    const plugin = createHybridSearchPlugin({ embeddingProvider: mockProvider });
    expect(plugin.name).toBe("@kizuna/plugin-hybrid-search");
    expect(plugin.version).toBe("0.1.0");
  });

  it("provides migrations", () => {
    const plugin = createHybridSearchPlugin({ embeddingProvider: mockProvider });
    const migrations = plugin.migrations!();
    expect(migrations).toHaveLength(1);
    expect(migrations[0]!.up).toContain("hybrid_search_embeddings");
  });

  it("init creates table and prepares statements", async () => {
    const plugin = createHybridSearchPlugin({ embeddingProvider: mockProvider });
    db.db.exec(plugin.migrations!()[0]!.up);
    await plugin.init!(ctx);

    const tables = db.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='hybrid_search_embeddings'",
      )
      .all();
    expect(tables).toHaveLength(1);
  });

  it("afterCapture stores embedding for chunk", async () => {
    const plugin = createHybridSearchPlugin({ embeddingProvider: mockProvider });
    db.db.exec(plugin.migrations!()[0]!.up);
    await plugin.init!(ctx);

    const chunk = makeStoredChunk(1, "TypeScriptでデータベースを実装する");
    db.insertChunk(chunk);
    await plugin.afterCapture!(chunk, ctx);

    const row = db.db
      .prepare("SELECT embedding FROM hybrid_search_embeddings WHERE chunk_id = ?")
      .get(1) as { embedding: Buffer } | undefined;
    expect(row).toBeDefined();
    const embedding = bufferToFloat32(row!.embedding);
    expect(embedding.length).toBe(mockProvider.dimensions);
  });

  it("afterSearch reranks results by hybrid score", async () => {
    const plugin = createHybridSearchPlugin({
      embeddingProvider: mockProvider,
      alpha: 0.5,
    });
    db.db.exec(plugin.migrations!()[0]!.up);
    await plugin.init!(ctx);

    const chunks = [
      makeStoredChunk(1, "SQLiteのデータベース接続を実装"),
      makeStoredChunk(2, "Reactコンポーネントを作成"),
      makeStoredChunk(3, "SQLiteのWALモードを設定"),
    ];
    for (const chunk of chunks) {
      db.insertChunk(chunk);
      await plugin.afterCapture!(chunk, ctx);
    }

    const query: SearchQuery = { text: "SQLite データベース", limit: 10 };
    await plugin.beforeSearch!(query, ctx);

    const results: SearchResult[] = [
      makeSearchResult(1, "SQLiteのデータベース接続を実装", 10.0),
      makeSearchResult(2, "Reactコンポーネントを作成", 8.0),
      makeSearchResult(3, "SQLiteのWALモードを設定", 6.0),
    ];
    const reranked = (await plugin.afterSearch!(results, ctx)) as SearchResult[];

    expect(reranked).toHaveLength(3);
    for (const r of reranked) {
      expect(r.annotations?.["bm25Score"]).toBeDefined();
      expect(r.annotations?.["vectorScore"]).toBeDefined();
      expect(r.annotations?.["hybridScore"]).toBeDefined();
    }
  });

  it("alpha=0 uses only BM25", async () => {
    const plugin = createHybridSearchPlugin({
      embeddingProvider: mockProvider,
      alpha: 0.0,
    });
    db.db.exec(plugin.migrations!()[0]!.up);
    await plugin.init!(ctx);

    const chunk = makeStoredChunk(1, "test content");
    db.insertChunk(chunk);
    await plugin.afterCapture!(chunk, ctx);

    const query: SearchQuery = { text: "query", limit: 10 };
    await plugin.beforeSearch!(query, ctx);

    const results = [makeSearchResult(1, "test content", 5.0)];
    const reranked = (await plugin.afterSearch!(results, ctx)) as SearchResult[];

    expect(reranked[0]!.score).toBeCloseTo(1.0);
  });

  it("alpha=1 uses only vector similarity", async () => {
    const plugin = createHybridSearchPlugin({
      embeddingProvider: mockProvider,
      alpha: 1.0,
    });
    db.db.exec(plugin.migrations!()[0]!.up);
    await plugin.init!(ctx);

    const chunk = makeStoredChunk(1, "test content");
    db.insertChunk(chunk);
    await plugin.afterCapture!(chunk, ctx);

    const query: SearchQuery = { text: "test content", limit: 10 };
    await plugin.beforeSearch!(query, ctx);

    const results = [makeSearchResult(1, "test content", 5.0)];
    const reranked = (await plugin.afterSearch!(results, ctx)) as SearchResult[];

    const vectorScore = reranked[0]!.annotations!["vectorScore"] as number;
    expect(reranked[0]!.score).toBeCloseTo((vectorScore + 1) / 2);
  });

  it("returns results unchanged when no embeddings exist", async () => {
    const plugin = createHybridSearchPlugin({ embeddingProvider: mockProvider });
    db.db.exec(plugin.migrations!()[0]!.up);
    await plugin.init!(ctx);

    const query: SearchQuery = { text: "test", limit: 10 };
    await plugin.beforeSearch!(query, ctx);

    const results = [makeSearchResult(99, "no embedding", 5.0)];
    const reranked = (await plugin.afterSearch!(results, ctx)) as SearchResult[];

    expect(reranked[0]!.score).toBe(5.0);
  });

  it("handles empty results", async () => {
    const plugin = createHybridSearchPlugin({ embeddingProvider: mockProvider });
    db.db.exec(plugin.migrations!()[0]!.up);
    await plugin.init!(ctx);

    const query: SearchQuery = { text: "test", limit: 10 };
    await plugin.beforeSearch!(query, ctx);

    const reranked = (await plugin.afterSearch!([], ctx)) as SearchResult[];
    expect(reranked).toHaveLength(0);
  });

  it("gracefully handles embedding failure in afterCapture", async () => {
    const plugin = createHybridSearchPlugin({
      embeddingProvider: new FailingEmbeddingProvider(),
    });
    db.db.exec(plugin.migrations!()[0]!.up);
    await plugin.init!(ctx);

    const chunk = makeStoredChunk(1, "test");
    db.insertChunk(chunk);
    await plugin.afterCapture!(chunk, ctx);

    const row = db.db.prepare("SELECT * FROM hybrid_search_embeddings WHERE chunk_id = ?").get(1);
    expect(row).toBeUndefined();
  });

  it("gracefully handles embedding failure in beforeSearch", async () => {
    const plugin = createHybridSearchPlugin({
      embeddingProvider: new FailingEmbeddingProvider(),
    });
    db.db.exec(plugin.migrations!()[0]!.up);
    await plugin.init!(ctx);

    const query: SearchQuery = { text: "test", limit: 10 };
    const result = (await plugin.beforeSearch!(query, ctx)) as SearchQuery;
    expect(result.text).toBe("test");

    const results = [makeSearchResult(1, "content", 5.0)];
    const reranked = (await plugin.afterSearch!(results, ctx)) as SearchResult[];
    expect(reranked[0]!.score).toBe(5.0);
  });

  it("preserves sort order by hybrid score", async () => {
    const plugin = createHybridSearchPlugin({
      embeddingProvider: mockProvider,
      alpha: 0.5,
    });
    db.db.exec(plugin.migrations!()[0]!.up);
    await plugin.init!(ctx);

    const chunks = [makeStoredChunk(1, "first chunk"), makeStoredChunk(2, "second chunk")];
    for (const chunk of chunks) {
      db.insertChunk(chunk);
      await plugin.afterCapture!(chunk, ctx);
    }

    const query: SearchQuery = { text: "first", limit: 10 };
    await plugin.beforeSearch!(query, ctx);

    const results = [
      makeSearchResult(1, "first chunk", 3.0),
      makeSearchResult(2, "second chunk", 10.0),
    ];
    const reranked = (await plugin.afterSearch!(results, ctx)) as SearchResult[];

    for (let i = 0; i < reranked.length - 1; i++) {
      expect(reranked[i]!.score).toBeGreaterThanOrEqual(reranked[i + 1]!.score);
    }
  });

  it("preserves existing annotations", async () => {
    const plugin = createHybridSearchPlugin({ embeddingProvider: mockProvider });
    db.db.exec(plugin.migrations!()[0]!.up);
    await plugin.init!(ctx);

    const chunk = makeStoredChunk(1, "test");
    db.insertChunk(chunk);
    await plugin.afterCapture!(chunk, ctx);

    const query: SearchQuery = { text: "test", limit: 10 };
    await plugin.beforeSearch!(query, ctx);

    const results: SearchResult[] = [
      {
        chunk: makeStoredChunk(1, "test"),
        score: 5.0,
        annotations: { existingKey: "value" },
      },
    ];
    const reranked = (await plugin.afterSearch!(results, ctx)) as SearchResult[];

    expect(reranked[0]!.annotations!["existingKey"]).toBe("value");
    expect(reranked[0]!.annotations!["hybridScore"]).toBeDefined();
  });
});
