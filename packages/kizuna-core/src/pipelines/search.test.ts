import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "../storage/database.js";
import { PluginManager } from "../plugin/plugin-manager.js";
import { searchMemory } from "./search.js";
import { preprocessQuery, isCJKChar, splitByCJK, escapeForLike } from "./cjk-preprocessing.js";
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
  it("generates trigrams for CJK text in ftsQuery", () => {
    const result = preprocessQuery("記憶を共有");
    expect(result.ftsQuery).toContain('"記憶を"');
    expect(result.ftsQuery).toContain('"憶を共"');
    expect(result.ftsQuery).toContain('"を共有"');
    expect(result.ftsQuery).toContain("OR");
    expect(result.likePatterns).toEqual([]);
  });

  it("passes through English words quoted in ftsQuery", () => {
    const result = preprocessQuery("hello world");
    expect(result.ftsQuery).toBe('"hello" "world"');
    expect(result.likePatterns).toEqual([]);
  });

  it("handles mixed English and Japanese (3+ chars CJK)", () => {
    const result = preprocessQuery("Claude記憶を共有");
    expect(result.ftsQuery).toContain('"Claude"');
    expect(result.ftsQuery).toContain('"記憶を"');
    expect(result.likePatterns).toEqual([]);
  });

  it("puts short CJK text (< 3 chars) into likePatterns", () => {
    const result = preprocessQuery("記憶");
    expect(result.ftsQuery).toBe("");
    expect(result.likePatterns).toEqual(["%記憶%"]);
  });

  it("puts single CJK character into likePatterns", () => {
    const result = preprocessQuery("記");
    expect(result.ftsQuery).toBe("");
    expect(result.likePatterns).toEqual(["%記%"]);
  });

  it("returns empty ftsQuery and likePatterns for empty input", () => {
    expect(preprocessQuery("")).toEqual({ ftsQuery: "", likePatterns: [] });
    expect(preprocessQuery("   ")).toEqual({ ftsQuery: "", likePatterns: [] });
  });

  it("handles CJK punctuation within text", () => {
    const result = preprocessQuery("テスト。確認");
    expect(result.ftsQuery).toContain("OR");
  });

  it("handles mixed FTS and LIKE (English + short CJK)", () => {
    const result = preprocessQuery("TypeScript認証");
    expect(result.ftsQuery).toContain('"TypeScript"');
    expect(result.likePatterns).toEqual(["%認証%"]);
  });
});

describe("escapeForLike", () => {
  it("escapes percent sign", () => {
    expect(escapeForLike("100%")).toBe("100\\%");
  });

  it("escapes underscore", () => {
    expect(escapeForLike("a_b")).toBe("a\\_b");
  });

  it("escapes backslash", () => {
    expect(escapeForLike("a\\b")).toBe("a\\\\b");
  });

  it("leaves normal text unchanged", () => {
    expect(escapeForLike("認証フロー")).toBe("認証フロー");
  });

  it("escapes multiple special characters", () => {
    expect(escapeForLike("100%_test\\")).toBe("100\\%\\_test\\\\");
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

    db.insertChunk({
      sessionId: "session-2",
      turnIndex: 2,
      role: "user",
      content: "TypeScriptで認証フローを実装する方法を教えてください。",
      metadata: {},
      importance: 7,
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

  it("searches mixed English and Japanese (FTS5 + LIKE)", async () => {
    const results = await searchMemory(db, {
      text: "TypeScript認証",
      limit: 10,
    });
    expect(results.length).toBeGreaterThan(0);
    const contents = results.map((r) => r.chunk.content);
    // Should match the chunk that contains both TypeScript and 認証
    expect(contents.some((c) => c.includes("TypeScript") && c.includes("認証"))).toBe(true);
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

  it("LIKE metacharacters in content do not cause false matches", async () => {
    // Insert a chunk with LIKE metacharacters
    db.insertChunk({
      sessionId: "session-1",
      turnIndex: 10,
      role: "user",
      content: "進捗率は100%を超えた",
      metadata: {},
      importance: 5,
    });

    // Searching for "進捗" should find it, not be confused by the % in content
    const results = await searchMemory(db, {
      text: "進捗",
      limit: 10,
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.some((r) => r.chunk.content.includes("100%"))).toBe(true);
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

    it("LIKE-only search works with sessionId filter", async () => {
      const results = await searchMemory(db, {
        text: "認証",
        limit: 10,
        filters: { sessionIds: ["session-2"] },
      });
      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result.chunk.sessionId).toBe("session-2");
        expect(result.chunk.content).toContain("認証");
      }
    });

    it("LIKE-only search works with projectId filter", async () => {
      const results = await searchMemory(db, {
        text: "認証",
        limit: 10,
        filters: { projectIds: ["project-b"] },
      });
      expect(results.length).toBeGreaterThan(0);
      for (const result of results) {
        expect(result.chunk.sessionId).toBe("session-2");
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

    it("handles short Japanese queries (2 chars) via LIKE fallback", async () => {
      const results = await searchMemory(db, {
        text: "実装",
        limit: 10,
      });
      expect(results.length).toBeGreaterThan(0);
      const contents = results.map((r) => r.chunk.content);
      expect(contents.some((c) => c.includes("実装"))).toBe(true);
    });

    it("finds 2-char CJK term '認証' via LIKE fallback", async () => {
      const results = await searchMemory(db, {
        text: "認証",
        limit: 10,
      });
      expect(results.length).toBeGreaterThan(0);
      const contents = results.map((r) => r.chunk.content);
      expect(contents.some((c) => c.includes("認証"))).toBe(true);
    });

    it("finds single CJK character via LIKE fallback", async () => {
      const results = await searchMemory(db, {
        text: "認",
        limit: 10,
      });
      expect(results.length).toBeGreaterThan(0);
      const contents = results.map((r) => r.chunk.content);
      expect(contents.some((c) => c.includes("認"))).toBe(true);
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

  // ─── Score Normalization Tests ─────────────────────────

  describe("score normalization by length", () => {
    let normDb: Database;
    let normDir: string;

    beforeEach(() => {
      normDir = mkdtempSync(join(tmpdir(), "kizuna-norm-test-"));
      normDb = new Database(join(normDir, "test.db"));

      normDb.insertSession({
        id: "norm-session",
        projectId: "norm-project",
        startedAt: "2025-06-01T00:00:00.000Z",
        endedAt: "2025-06-01T01:00:00.000Z",
        transcriptPath: null,
        metadata: {},
      });

      // Short chunk with keyword
      normDb.insertChunk({
        sessionId: "norm-session",
        turnIndex: 0,
        role: "user",
        content: "authentication module design",
        metadata: {},
        importance: 5,
      });

      // Very long chunk with the keyword repeated frequently throughout.
      // BM25 rewards high term frequency, so this chunk should score high
      // in raw BM25 ranking despite its length.
      const longContent = (
        "authentication system design and implementation details. " +
        "The authentication layer handles user credentials. "
      ).repeat(50);
      normDb.insertChunk({
        sessionId: "norm-session",
        turnIndex: 1,
        role: "assistant",
        content: longContent,
        metadata: {},
        importance: 5,
      });

      // Medium chunk with keyword
      normDb.insertChunk({
        sessionId: "norm-session",
        turnIndex: 2,
        role: "user",
        content:
          "We need to implement the authentication flow using JWT tokens for the API gateway.",
        metadata: {},
        importance: 5,
      });
    });

    afterEach(() => {
      normDb.close();
      rmSync(normDir, { recursive: true, force: true });
    });

    it("normalizes scores so long chunks do not dominate", async () => {
      const normalizedResults = await searchMemory(
        normDb,
        { text: "authentication", limit: 10 },
        { normalizeByLength: true },
      );

      expect(normalizedResults.length).toBeGreaterThanOrEqual(2);

      // The short chunk should rank higher than the very long chunk after normalization
      const shortIdx = normalizedResults.findIndex(
        (r) => r.chunk.content === "authentication module design",
      );
      const longIdx = normalizedResults.findIndex((r) => r.chunk.content.length > 1000);

      expect(shortIdx).toBeGreaterThanOrEqual(0);
      expect(longIdx).toBeGreaterThanOrEqual(0);
      expect(shortIdx).toBeLessThan(longIdx);
    });

    it("does not normalize when disabled — long chunk outranks short chunk", async () => {
      const results = await searchMemory(
        normDb,
        { text: "authentication", limit: 10 },
        { normalizeByLength: false },
      );

      expect(results.length).toBeGreaterThanOrEqual(2);

      const shortIdx = results.findIndex((r) => r.chunk.content === "authentication module design");
      const longIdx = results.findIndex((r) => r.chunk.content.length > 1000);

      expect(shortIdx).toBeGreaterThanOrEqual(0);
      expect(longIdx).toBeGreaterThanOrEqual(0);

      // Without normalization, the long chunk (with more keyword occurrences
      // and boosted by keyword reranking) should rank higher or equal.
      // This confirms that normalization genuinely changes the ranking.
      expect(longIdx).toBeLessThanOrEqual(shortIdx);
    });

    it("applies normalization by default (matches PIPELINE_DEFAULTS)", async () => {
      // Default is normalizeByLength: true (from PIPELINE_DEFAULTS.normalizeScoreByLength)
      const results = await searchMemory(normDb, { text: "authentication", limit: 10 });

      expect(results.length).toBeGreaterThanOrEqual(2);
      // Scores should reflect normalization
      for (const r of results) {
        expect(r.score).toBeGreaterThan(0);
      }
    });

    it("respects the requested limit after normalization re-ranking", async () => {
      const results = await searchMemory(
        normDb,
        { text: "authentication", limit: 1 },
        { normalizeByLength: true },
      );

      expect(results.length).toBe(1);
    });
  });
});
