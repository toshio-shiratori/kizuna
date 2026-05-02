import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "../storage/database.js";
import type { SearchResult } from "../index.js";
import { formatContext, injectMemory } from "./inject.js";

// ─── formatContext Tests ─────────────────────────────────

describe("formatContext", () => {
  function makeResult(
    content: string,
    overrides: Partial<{ role: "user" | "assistant"; createdAt: string; importance: number; score: number }> = {},
  ): SearchResult {
    return {
      chunk: {
        id: 1,
        sessionId: "session-1",
        turnIndex: 0,
        role: overrides.role ?? "assistant",
        content,
        tokenCount: 0,
        importance: overrides.importance ?? 5,
        createdAt: overrides.createdAt ?? "2025-06-01T10:00:00.000Z",
        metadata: {},
      },
      score: overrides.score ?? 1.0,
    };
  }

  it("returns empty for no results", () => {
    const result = formatContext([], 2000);
    expect(result.context).toBe("");
    expect(result.chunksUsed).toBe(0);
    expect(result.tokensUsed).toBe(0);
  });

  it("formats a single result", () => {
    const results = [makeResult("Authentication uses JWT tokens.")];
    const result = formatContext(results, 2000);

    expect(result.context).toContain("## Relevant Memories");
    expect(result.context).toContain("[2025-06-01] assistant");
    expect(result.context).toContain("Authentication uses JWT tokens.");
    expect(result.chunksUsed).toBe(1);
    expect(result.tokensUsed).toBeGreaterThan(0);
  });

  it("formats multiple results with separators", () => {
    const results = [
      makeResult("First memory.", { createdAt: "2025-06-02T00:00:00.000Z" }),
      makeResult("Second memory.", { role: "user", createdAt: "2025-06-01T00:00:00.000Z" }),
    ];
    const result = formatContext(results, 2000);

    expect(result.context).toContain("First memory.");
    expect(result.context).toContain("Second memory.");
    expect(result.context).toContain("---");
    expect(result.chunksUsed).toBe(2);
  });

  it("respects token budget by truncating results", () => {
    const longContent = "x".repeat(500);
    const results = [
      makeResult(longContent),
      makeResult(longContent),
      makeResult(longContent),
    ];

    const smallBudget = 200;
    const result = formatContext(results, smallBudget);

    expect(result.chunksUsed).toBeLessThan(3);
    expect(result.tokensUsed).toBeLessThanOrEqual(smallBudget);
  });

  it("returns empty when budget is too small for even the header", () => {
    const results = [makeResult("short")];
    const result = formatContext(results, 1);

    expect(result.context).toBe("");
    expect(result.chunksUsed).toBe(0);
  });

  it("returns empty when budget fits header but not any chunk", () => {
    const longContent = "x".repeat(1000);
    const results = [makeResult(longContent)];
    const headerOnlyBudget = 10;
    const result = formatContext(results, headerOnlyBudget);

    expect(result.context).toBe("");
    expect(result.chunksUsed).toBe(0);
  });

  it("includes date from createdAt in block header", () => {
    const results = [makeResult("content", { createdAt: "2025-12-25T15:30:00.000Z" })];
    const result = formatContext(results, 2000);
    expect(result.context).toContain("[2025-12-25]");
  });

  it("includes role in block header", () => {
    const results = [makeResult("question?", { role: "user" })];
    const result = formatContext(results, 2000);
    expect(result.context).toContain("user");
  });

  it("handles Japanese content within budget", () => {
    const results = [makeResult("SQLiteでデータベース接続を実装しました。")];
    const result = formatContext(results, 2000);

    expect(result.context).toContain("SQLiteでデータベース接続を実装しました。");
    expect(result.chunksUsed).toBe(1);
    expect(result.tokensUsed).toBeGreaterThan(0);
  });
});

// ─── injectMemory Integration Tests ─────────────────────

describe("injectMemory", () => {
  let db: Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "kizuna-inject-test-"));
    db = new Database(join(tmpDir, "test.db"));

    db.insertSession({
      id: "session-1",
      projectId: "project-a",
      startedAt: "2025-06-01T00:00:00.000Z",
      endedAt: "2025-06-01T01:00:00.000Z",
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
      sessionId: "session-1",
      turnIndex: 2,
      role: "user",
      content: "TypeScriptでデータベース接続を実装する方法を教えてください。",
      metadata: {},
      importance: 6,
    });
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns relevant context for a query", () => {
    const result = injectMemory(db, "authentication JWT");
    expect(result.context).toContain("authentication");
    expect(result.chunksUsed).toBeGreaterThan(0);
    expect(result.tokensUsed).toBeGreaterThan(0);
  });

  it("returns empty for empty prompt", () => {
    const result = injectMemory(db, "");
    expect(result.context).toBe("");
    expect(result.chunksUsed).toBe(0);
  });

  it("returns empty for whitespace-only prompt", () => {
    const result = injectMemory(db, "   ");
    expect(result.context).toBe("");
    expect(result.chunksUsed).toBe(0);
  });

  it("returns empty when no matches found", () => {
    const result = injectMemory(db, "xyznonexistent");
    expect(result.context).toBe("");
    expect(result.chunksUsed).toBe(0);
  });

  it("respects tokenBudget option", () => {
    const small = injectMemory(db, "TypeScript", { tokenBudget: 50 });
    const large = injectMemory(db, "TypeScript", { tokenBudget: 5000 });
    expect(small.chunksUsed).toBeLessThanOrEqual(large.chunksUsed);
    expect(small.tokensUsed).toBeLessThanOrEqual(50);
  });

  it("respects maxResults option", () => {
    const result = injectMemory(db, "TypeScript", { maxResults: 1 });
    expect(result.chunksUsed).toBeLessThanOrEqual(1);
  });

  it("works with Japanese prompts", () => {
    const result = injectMemory(db, "データベース接続");
    expect(result.chunksUsed).toBeGreaterThan(0);
    expect(result.context).toContain("データベース");
  });
});
