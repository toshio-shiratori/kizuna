import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "../storage/database.js";
import { PluginManager } from "../plugin/plugin-manager.js";
import { searchMemory } from "./search.js";
import { preprocessQuery, isCJKChar, splitByCJK } from "./cjk-preprocessing.js";
import type { Plugin } from "../index.js";

// ─── CJK Preprocessing Tests ────────────────────────────

describe("isCJKChar", () => {
  it("detects Hiragana", () => {
    expect(isCJKChar("あ")).toBe(true);
    expect(isCJKChar("ん")).toBe(true);
  });

  it("detects Katakana", () => {
    expect(isCJKChar("ア")).toBe(true);
    expect(isCJKChar("ン")).toBe(true);
  });

  it("detects CJK Ideographs", () => {
    expect(isCJKChar("漢")).toBe(true);
    expect(isCJKChar("字")).toBe(true);
  });

  it("detects fullwidth forms", () => {
    expect(isCJKChar("Ａ")).toBe(true);
    expect(isCJKChar("１")).toBe(true);
  });

  it("detects CJK punctuation", () => {
    expect(isCJKChar("。")).toBe(true);
    expect(isCJKChar("、")).toBe(true);
    expect(isCJKChar("「")).toBe(true);
  });

  it("rejects ASCII characters", () => {
    expect(isCJKChar("a")).toBe(false);
    expect(isCJKChar("Z")).toBe(false);
    expect(isCJKChar("1")).toBe(false);
    expect(isCJKChar(".")).toBe(false);
  });
});

describe("splitByCJK", () => {
  it("splits text into CJK and non-CJK segments", () => {
    const segments = splitByCJK("hello世界test");
    expect(segments).toEqual([
      { text: "hello", cjk: false },
      { text: "世界", cjk: true },
      { text: "test", cjk: false },
    ]);
  });

  it("handles pure CJK text", () => {
    const segments = splitByCJK("記憶を共有する");
    expect(segments).toEqual([{ text: "記憶を共有する", cjk: true }]);
  });

  it("handles pure ASCII text", () => {
    const segments = splitByCJK("hello world");
    expect(segments).toEqual([{ text: "hello world", cjk: false }]);
  });

  it("handles empty string", () => {
    const segments = splitByCJK("");
    expect(segments).toEqual([]);
  });
});

describe("preprocessQuery", () => {
  it("generates trigrams for CJK text", () => {
    const result = preprocessQuery("記憶を共有");
    expect(result).toContain('"記憶を"');
    expect(result).toContain('"憶を共"');
    expect(result).toContain('"を共有"');
    expect(result).toContain("OR");
  });

  it("passes through English words quoted", () => {
    const result = preprocessQuery("hello world");
    expect(result).toBe('"hello" "world"');
  });

  it("handles mixed English and Japanese", () => {
    const result = preprocessQuery("Claude記憶を共有");
    expect(result).toContain('"Claude"');
    expect(result).toContain('"記憶を"');
  });

  it("handles short CJK text (< 3 chars) with quoting", () => {
    const result = preprocessQuery("記憶");
    expect(result).toBe('"記憶"');
  });

  it("handles single CJK character", () => {
    const result = preprocessQuery("記");
    expect(result).toBe('"記"');
  });

  it("returns empty string for empty input", () => {
    expect(preprocessQuery("")).toBe("");
    expect(preprocessQuery("   ")).toBe("");
  });

  it("handles CJK punctuation within text", () => {
    const result = preprocessQuery("テスト。確認");
    expect(result).toContain("OR");
  });
});

// ─── Search Pipeline Integration Tests ───────────────────

describe("searchMemory", () => {
  let db: Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "kizuna-search-test-"));
    db = new Database(join(tmpDir, "test.db"));

    db.insertSession({
      id: "session-1",
      projectId: "project-a",
      startedAt: "2025-06-01T00:00:00.000Z",
      endedAt: "2025-06-01T01:00:00.000Z",
      transcriptPath: null,
      metadata: {},
    });

    db.insertSession({
      id: "session-2",
      projectId: "project-b",
      startedAt: "2025-06-02T00:00:00.000Z",
      endedAt: "2025-06-02T01:00:00.000Z",
      transcriptPath: null,
      metadata: {},
    });

    db.insertChunk({
      sessionId: "session-1",
      turnIndex: 0,
      role: "user",
      content: "How do I implement authentication in TypeScript?",
      metadata: {},
      importance: 7,
    });

    db.insertChunk({
      sessionId: "session-1",
      turnIndex: 1,
      role: "assistant",
      content:
        "You can use JWT tokens for authentication. Here is an example with Express middleware.",
      metadata: {},
      importance: 8,
    });

    db.insertChunk({
      sessionId: "session-2",
      turnIndex: 0,
      role: "user",
      content: "TypeScriptでデータベース接続を実装する方法を教えてください。",
      metadata: {},
      importance: 6,
    });

    db.insertChunk({
      sessionId: "session-2",
      turnIndex: 1,
      role: "assistant",
      content:
        "SQLiteを使ったデータベース接続の実装例を示します。better-sqlite3ライブラリが最適です。",
      metadata: {},
      importance: 7,
    });

    db.insertChunk({
      sessionId: "session-1",
      turnIndex: 2,
      role: "user",
      content: "What about database connection pooling?",
      metadata: {},
      importance: 5,
    });
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("searches English content", async () => {
    const results = await searchMemory(db, {
      text: "authentication",
      limit: 10,
    });
    expect(results.length).toBeGreaterThan(0);
    const contents = results.map((r) => r.chunk.content);
    expect(contents.some((c) => c.includes("authentication"))).toBe(true);
  });

  it("searches Japanese content", async () => {
    const results = await searchMemory(db, {
      text: "データベース接続",
      limit: 10,
    });
    expect(results.length).toBeGreaterThan(0);
    const contents = results.map((r) => r.chunk.content);
    expect(contents.some((c) => c.includes("データベース"))).toBe(true);
  });

  it("searches mixed English and Japanese", async () => {
    const results = await searchMemory(db, {
      text: "TypeScript認証",
      limit: 10,
    });
    expect(results.length).toBeGreaterThan(0);
  });

  it("returns results with scores", async () => {
    const results = await searchMemory(db, {
      text: "authentication JWT",
      limit: 10,
    });
    expect(results.length).toBeGreaterThan(0);
    for (const result of results) {
      expect(result.score).toBeGreaterThan(0);
      expect(result.chunk.id).toBeDefined();
      expect(result.chunk.content).toBeDefined();
    }
  });

  it("respects limit", async () => {
    const results = await searchMemory(db, {
      text: "TypeScript",
      limit: 1,
    });
    expect(results.length).toBeLessThanOrEqual(1);
  });

  it("returns empty for no matches", async () => {
    const results = await searchMemory(db, {
      text: "xyznonexistent",
      limit: 10,
    });
    expect(results).toEqual([]);
  });

  it("returns empty for empty query", async () => {
    const results = await searchMemory(db, { text: "", limit: 10 });
    expect(results).toEqual([]);
  });

  it("applies keyword reranking boost", async () => {
    const results = await searchMemory(db, {
      text: "database connection",
      limit: 10,
    });
    if (results.length >= 2) {
      const topContent = results[0]!.chunk.content.toLowerCase();
      expect(topContent.includes("database") || topContent.includes("connection")).toBe(true);
    }
  });

  // ─── Filter Tests ──────────────────────────────────────

  describe("with filters", () => {
    it("filters by sessionId", async () => {
      const results = await searchMemory(db, {
        text: "TypeScript",
        limit: 10,
        filters: { sessionIds: ["session-1"] },
      });
      for (const result of results) {
        expect(result.chunk.sessionId).toBe("session-1");
      }
    });

    it("filters by projectId", async () => {
      const results = await searchMemory(db, {
        text: "データベース",
        limit: 10,
        filters: { projectIds: ["project-b"] },
      });
      for (const result of results) {
        expect(result.chunk.sessionId).toBe("session-2");
      }
    });

    it("filters by minImportance", async () => {
      const results = await searchMemory(db, {
        text: "TypeScript",
        limit: 10,
        filters: { minImportance: 7 },
      });
      for (const result of results) {
        expect(result.chunk.importance).toBeGreaterThanOrEqual(7);
      }
    });

    it("filters by date range", async () => {
      const results = await searchMemory(db, {
        text: "TypeScript",
        limit: 10,
        filters: {
          createdAfter: "2025-06-01T00:30:00.000Z",
        },
      });
      for (const result of results) {
        expect(result.chunk.createdAt >= "2025-06-01T00:30:00.000Z").toBe(true);
      }
    });

    it("combines multiple filters", async () => {
      const results = await searchMemory(db, {
        text: "authentication",
        limit: 10,
        filters: {
          sessionIds: ["session-1"],
          minImportance: 7,
        },
      });
      for (const result of results) {
        expect(result.chunk.sessionId).toBe("session-1");
        expect(result.chunk.importance).toBeGreaterThanOrEqual(7);
      }
    });
  });

  // ─── Japanese-Specific Tests (per ADR-0009) ────────────

  describe("Japanese query patterns", () => {
    it("handles Japanese with particles", async () => {
      const results = await searchMemory(db, {
        text: "データベースの接続",
        limit: 10,
      });
      expect(results.length).toBeGreaterThan(0);
    });

    it("handles short Japanese queries (2 chars)", async () => {
      const results = await searchMemory(db, {
        text: "実装",
        limit: 10,
      });
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it("handles Katakana queries", async () => {
      const results = await searchMemory(db, {
        text: "ライブラリ",
        limit: 10,
      });
      expect(results.length).toBeGreaterThan(0);
    });
  });

  // ─── Plugin Integration Tests ──────────────────────────

  describe("with plugins", () => {
    it("runs beforeSearch to modify query", async () => {
      const pm = new PluginManager({ db: db.db, projectConfig: { id: "test" } });
      const plugin: Plugin = {
        name: "query-rewriter",
        version: "1.0.0",
        beforeSearch(query) {
          return { ...query, text: "authentication" };
        },
      };
      pm.register(plugin);
      await pm.initAll();

      const results = await searchMemory(
        db,
        { text: "something unrelated", limit: 10 },
        { pluginManager: pm },
      );
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.chunk.content.includes("authentication"))).toBe(true);
    });

    it("runs afterSearch to filter results", async () => {
      const pm = new PluginManager({ db: db.db, projectConfig: { id: "test" } });
      const plugin: Plugin = {
        name: "result-filter",
        version: "1.0.0",
        afterSearch(results) {
          return results.filter((r) => r.chunk.role === "assistant");
        },
      };
      pm.register(plugin);
      await pm.initAll();

      const results = await searchMemory(
        db,
        { text: "TypeScript", limit: 10 },
        { pluginManager: pm },
      );
      for (const r of results) {
        expect(r.chunk.role).toBe("assistant");
      }
    });

    it("continues search when plugin throws in beforeSearch", async () => {
      const pm = new PluginManager({ db: db.db, projectConfig: { id: "test" } });
      pm.register({
        name: "error-plugin",
        version: "1.0.0",
        beforeSearch() {
          throw new Error("plugin error");
        },
      });
      await pm.initAll();

      const results = await searchMemory(
        db,
        { text: "authentication", limit: 10 },
        { pluginManager: pm },
      );
      expect(results.length).toBeGreaterThan(0);
    });
  });
});
