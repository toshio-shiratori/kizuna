import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "../storage/database.js";
import { exportMemory } from "./export-memory.js";

describe("exportMemory", () => {
  let tempDir: string;
  let db: Database;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "kizuna-export-test-"));
    db = new Database(join(tempDir, "test.db"));
    seedTestData(db);
  });

  afterEach(() => {
    db.close();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("exports all chunks in markdown format by default", async () => {
    const output = await exportMemory(db, {
      projectId: "test-project",
      now: new Date("2025-06-20T12:00:00.000Z"),
    });

    expect(output).toContain("# Kizuna Memory Export");
    expect(output).toContain("- **Project**: test-project");
    expect(output).toContain("- **Chunks**: 3");
    expect(output).toContain("assistant");
    expect(output).toContain("user");
  });

  it("exports in JSON format", async () => {
    const output = await exportMemory(db, {
      format: "json",
      projectId: "test-project",
      now: new Date("2025-06-20T12:00:00.000Z"),
    });

    const parsed = JSON.parse(output);
    expect(parsed.meta.projectId).toBe("test-project");
    expect(parsed.meta.chunkCount).toBe(3);
    expect(parsed.chunks).toHaveLength(3);
  });

  it("filters by --since", async () => {
    const output = await exportMemory(db, {
      since: "2025-06-15T00:00:00Z",
      format: "json",
      projectId: "test-project",
      now: new Date("2025-06-20T12:00:00.000Z"),
    });

    const parsed = JSON.parse(output);
    // Only chunks from June 15 and later
    expect(parsed.chunks.length).toBeGreaterThanOrEqual(1);
    for (const chunk of parsed.chunks) {
      expect(chunk.createdAt >= "2025-06-15T00:00:00").toBe(true);
    }
  });

  it("filters by --until", async () => {
    const output = await exportMemory(db, {
      until: "2025-06-11T00:00:00Z",
      format: "json",
      projectId: "test-project",
      now: new Date("2025-06-20T12:00:00.000Z"),
    });

    const parsed = JSON.parse(output);
    for (const chunk of parsed.chunks) {
      expect(chunk.createdAt <= "2025-06-11T00:00:00").toBe(true);
    }
  });

  it("filters by --since with relative date", async () => {
    const output = await exportMemory(db, {
      since: "7d",
      format: "json",
      projectId: "test-project",
      now: new Date("2025-06-20T12:00:00.000Z"),
    });

    const parsed = JSON.parse(output);
    // 7 days before June 20 is June 13 - only June 15 chunk should match
    for (const chunk of parsed.chunks) {
      expect(new Date(chunk.createdAt).getTime()).toBeGreaterThanOrEqual(
        new Date("2025-06-13T12:00:00.000Z").getTime(),
      );
    }
  });

  it("applies --limit", async () => {
    const output = await exportMemory(db, {
      limit: 1,
      format: "json",
      projectId: "test-project",
      now: new Date("2025-06-20T12:00:00.000Z"),
    });

    const parsed = JSON.parse(output);
    expect(parsed.chunks).toHaveLength(1);
    expect(parsed.meta.chunkCount).toBe(1);
  });

  it("uses search pipeline when --query is specified", async () => {
    const output = await exportMemory(db, {
      query: "SQLite",
      format: "json",
      projectId: "test-project",
      now: new Date("2025-06-20T12:00:00.000Z"),
    });

    const parsed = JSON.parse(output);
    expect(parsed.chunks.length).toBeGreaterThanOrEqual(1);
    // At least one chunk should contain SQLite
    const hasSqlite = parsed.chunks.some((c: { content: string }) =>
      c.content.toLowerCase().includes("sqlite"),
    );
    expect(hasSqlite).toBe(true);
  });

  it("returns empty results when no chunks match", async () => {
    const output = await exportMemory(db, {
      since: "2099-01-01T00:00:00Z",
      format: "json",
      projectId: "test-project",
      now: new Date("2025-06-20T12:00:00.000Z"),
    });

    const parsed = JSON.parse(output);
    expect(parsed.meta.chunkCount).toBe(0);
    expect(parsed.chunks).toEqual([]);
    expect(parsed.meta.dateRange).toBeNull();
  });

  it("orders chunks newest first when no query", async () => {
    const output = await exportMemory(db, {
      format: "json",
      projectId: "test-project",
      now: new Date("2025-06-20T12:00:00.000Z"),
    });

    const parsed = JSON.parse(output);
    for (let i = 1; i < parsed.chunks.length; i++) {
      expect(parsed.chunks[i - 1].createdAt >= parsed.chunks[i].createdAt).toBe(true);
    }
  });

  it("includes filters metadata in output", async () => {
    const output = await exportMemory(db, {
      since: "7d",
      until: "1d",
      query: "test",
      limit: 50,
      format: "json",
      projectId: "test-project",
      now: new Date("2025-06-20T12:00:00.000Z"),
    });

    const parsed = JSON.parse(output);
    expect(parsed.meta.filters).toEqual({
      since: "7d",
      until: "1d",
      query: "test",
      limit: 50,
    });
  });
});

function seedTestData(db: Database): void {
  // Insert a session
  db.insertSession({
    id: "test-session-001",
    projectId: "test-project",
    startedAt: "2025-06-10T10:00:00.000Z",
    endedAt: "2025-06-10T11:00:00.000Z",
    transcriptPath: null,
    metadata: {},
  });

  // Insert chunks at different times
  db.insertChunk({
    sessionId: "test-session-001",
    turnIndex: 0,
    role: "user",
    content: "How do I connect to SQLite database in TypeScript?",
    metadata: {},
    importance: 5,
    createdAt: "2025-06-10T10:00:00.000Z",
  });

  db.insertChunk({
    sessionId: "test-session-001",
    turnIndex: 1,
    role: "assistant",
    content: "You can use better-sqlite3 with WAL mode for SQLite in TypeScript.",
    metadata: {},
    importance: 7,
    createdAt: "2025-06-12T10:00:00.000Z",
  });

  db.insertChunk({
    sessionId: "test-session-001",
    turnIndex: 2,
    role: "user",
    content: "Show me an example of database connection pooling.",
    metadata: {},
    importance: 4,
    createdAt: "2025-06-15T10:00:00.000Z",
  });
}
