import { describe, it, expect } from "vitest";
import type {
  RawChunk,
  SearchQuery,
  SearchResult,
  StoredChunk,
  PluginContext,
  PluginConfig,
  Logger,
} from "@kizuna/core";
import { multiRepoSharing } from "./index.js";

const PLUGIN_NAME = "@kizuna/plugin-multi-repo-sharing";

function makeChunk(content: string, metadata: Record<string, unknown> = {}): RawChunk {
  return {
    sessionId: "test-session",
    turnIndex: 0,
    role: "assistant",
    content,
    metadata,
  };
}

function makeStoredChunk(
  overrides: Partial<StoredChunk> & { metadata?: Record<string, unknown> } = {},
): StoredChunk {
  return {
    id: 1,
    sessionId: "test-session",
    turnIndex: 0,
    role: "assistant",
    content: "test content",
    tokenCount: 10,
    importance: 5,
    createdAt: new Date().toISOString(),
    metadata: {},
    ...overrides,
  };
}

function makeContext(projectId: string, options: Record<string, unknown> = {}): PluginContext {
  const logger: Logger = {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
  const config: PluginConfig = { enabled: true, options };
  return {
    db: {},
    config,
    projectConfig: { id: projectId },
    logger,
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

function runBeforeCapture(chunk: RawChunk, ctx: PluginContext): RawChunk {
  return multiRepoSharing.beforeCapture!(chunk, ctx) as RawChunk;
}

function runBeforeSearch(query: SearchQuery, ctx: PluginContext): SearchQuery {
  return multiRepoSharing.beforeSearch!(query, ctx) as SearchQuery;
}

function runAfterSearch(results: SearchResult[], ctx: PluginContext): SearchResult[] {
  return multiRepoSharing.afterSearch!(results, ctx) as SearchResult[];
}

describe("multiRepoSharing plugin", () => {
  it("has correct metadata", () => {
    expect(multiRepoSharing.name).toBe(PLUGIN_NAME);
    expect(multiRepoSharing.version).toBe("0.0.0");
    expect(multiRepoSharing.description).toBeDefined();
  });

  it("provides migrations", () => {
    const migrations = multiRepoSharing.migrations!();
    expect(migrations).toHaveLength(1);
    expect(migrations[0]!.version).toBe(1);
    expect(migrations[0]!.up).toContain("CREATE INDEX");
  });
});

describe("beforeCapture", () => {
  it("tags chunk with repo ID", () => {
    const chunk = makeChunk("test content");
    const ctx = makeContext("my-frontend");
    const result = runBeforeCapture(chunk, ctx);

    expect(result.metadata[PLUGIN_NAME]).toEqual({
      repoId: "my-frontend",
      namespace: null,
    });
  });

  it("tags chunk with repo ID and namespace", () => {
    const chunk = makeChunk("test content");
    const ctx = makeContext("my-frontend", { namespace: "my-org-shared" });
    const result = runBeforeCapture(chunk, ctx);

    expect(result.metadata[PLUGIN_NAME]).toEqual({
      repoId: "my-frontend",
      namespace: "my-org-shared",
    });
  });

  it("preserves existing metadata", () => {
    const chunk = makeChunk("test content", { existingKey: "existingValue" });
    const ctx = makeContext("my-frontend");
    const result = runBeforeCapture(chunk, ctx);

    expect(result.metadata["existingKey"]).toBe("existingValue");
    expect(result.metadata[PLUGIN_NAME]).toBeDefined();
  });

  it("does not mutate original chunk", () => {
    const chunk = makeChunk("test content");
    const originalMetadata = { ...chunk.metadata };
    const ctx = makeContext("my-frontend");
    runBeforeCapture(chunk, ctx);

    expect(chunk.metadata).toEqual(originalMetadata);
  });
});

describe("beforeSearch", () => {
  it("scopes search to current repo when no namespace", () => {
    const query: SearchQuery = { text: "test", limit: 10 };
    const ctx = makeContext("my-frontend");
    const result = runBeforeSearch(query, ctx);

    expect(result.filters?.namespaces).toEqual(["my-frontend"]);
  });

  it("includes shared namespace in search scope", () => {
    const query: SearchQuery = { text: "test", limit: 10 };
    const ctx = makeContext("my-frontend", { namespace: "my-org-shared" });
    const result = runBeforeSearch(query, ctx);

    expect(result.filters?.namespaces).toEqual(["my-frontend", "my-org-shared"]);
  });

  it("preserves existing query filters", () => {
    const query: SearchQuery = {
      text: "test",
      limit: 10,
      filters: { minImportance: 3 },
    };
    const ctx = makeContext("my-frontend");
    const result = runBeforeSearch(query, ctx);

    expect(result.filters?.minImportance).toBe(3);
    expect(result.filters?.namespaces).toEqual(["my-frontend"]);
  });

  it("preserves query text and limit", () => {
    const query: SearchQuery = { text: "search term", limit: 5 };
    const ctx = makeContext("my-frontend");
    const result = runBeforeSearch(query, ctx);

    expect(result.text).toBe("search term");
    expect(result.limit).toBe(5);
  });
});

describe("afterSearch", () => {
  it("annotates shared results", () => {
    const results: SearchResult[] = [
      {
        chunk: makeStoredChunk({
          metadata: {
            [PLUGIN_NAME]: { repoId: "other-repo", namespace: "my-org-shared" },
          },
        }),
        score: 1.0,
      },
    ];
    const ctx = makeContext("my-frontend", { namespace: "my-org-shared" });
    const annotated = runAfterSearch(results, ctx);

    expect(annotated[0]!.annotations?.["isShared"]).toBe(true);
  });

  it("annotates local results as not shared", () => {
    const results: SearchResult[] = [
      {
        chunk: makeStoredChunk({
          metadata: {
            [PLUGIN_NAME]: { repoId: "my-frontend", namespace: null },
          },
        }),
        score: 1.0,
      },
    ];
    const ctx = makeContext("my-frontend");
    const annotated = runAfterSearch(results, ctx);

    expect(annotated[0]!.annotations?.["isShared"]).toBe(false);
  });

  it("handles chunks without plugin metadata", () => {
    const results: SearchResult[] = [
      {
        chunk: makeStoredChunk({ metadata: {} }),
        score: 1.0,
      },
    ];
    const ctx = makeContext("my-frontend");
    const annotated = runAfterSearch(results, ctx);

    expect(annotated[0]!.annotations?.["isShared"]).toBe(false);
  });

  it("preserves existing annotations", () => {
    const results: SearchResult[] = [
      {
        chunk: makeStoredChunk({
          metadata: {
            [PLUGIN_NAME]: { repoId: "other-repo", namespace: "shared" },
          },
        }),
        score: 1.0,
        annotations: { customAnnotation: "value" },
      },
    ];
    const ctx = makeContext("my-frontend");
    const annotated = runAfterSearch(results, ctx);

    expect(annotated[0]!.annotations?.["customAnnotation"]).toBe("value");
    expect(annotated[0]!.annotations?.["isShared"]).toBe(true);
  });

  it("does not mutate original results", () => {
    const original: SearchResult[] = [
      {
        chunk: makeStoredChunk({
          metadata: {
            [PLUGIN_NAME]: { repoId: "other-repo", namespace: "shared" },
          },
        }),
        score: 1.0,
      },
    ];
    const ctx = makeContext("my-frontend");
    runAfterSearch(original, ctx);

    expect(original[0]!.annotations).toBeUndefined();
  });
});
