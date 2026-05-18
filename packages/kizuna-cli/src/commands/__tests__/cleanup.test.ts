import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { Database } from "@kizuna/core";
import { runCli, createTempDir, removeTempDir } from "../../test-utils.js";

function seedForCleanup(cwd: string): Database {
  const kizunaDir = join(cwd, ".kizuna");
  mkdirSync(kizunaDir, { recursive: true });
  const db = new Database(join(kizunaDir, "memory.db"));

  db.insertSession({
    id: "session-1",
    projectId: "test-project",
    startedAt: "2025-01-15T10:00:00Z",
    endedAt: "2025-01-15T11:00:00Z",
    transcriptPath: null,
    metadata: {},
  });

  db.insertChunk({
    sessionId: "session-1",
    turnIndex: 0,
    role: "user",
    content: "TypeScriptでデータベース接続を実装してください",
    metadata: {},
  });
  db.insertChunk({
    sessionId: "session-1",
    turnIndex: 1,
    role: "assistant",
    content: "SQLiteのWALモードでデータベース接続を実装しました。better-sqlite3を使用しています。",
    metadata: {},
  });
  db.insertChunk({
    sessionId: "session-1",
    turnIndex: 2,
    role: "user",
    content: "OK",
    metadata: {},
  });
  db.insertChunk({
    sessionId: "session-1",
    turnIndex: 3,
    role: "user",
    content: "YES",
    metadata: {},
  });

  return db;
}

describe("cleanup command", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  it("should report when no database exists", () => {
    const result = runCli(`cleanup --yes --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("No Kizuna database found");
  });

  describe("--apply-filters mode", () => {
    it("should delete low-quality chunks with --yes", () => {
      const db = seedForCleanup(tempDir);
      db.close();

      const result = runCli(`cleanup --apply-filters --yes --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Cleanup completed");
      expect(result.stdout).toContain("Chunks deleted:");
    });

    it("should show preview with --dry-run", () => {
      const db = seedForCleanup(tempDir);
      db.close();

      const result = runCli(`cleanup --apply-filters --dry-run --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Found");
      expect(result.stdout).toContain("Run without --dry-run to delete");
    });

    it("should report clean database when no low-quality chunks exist", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.insertSession({
        id: "s1",
        projectId: "p1",
        startedAt: "2025-01-01T00:00:00Z",
        endedAt: "2025-01-01T01:00:00Z",
        transcriptPath: null,
        metadata: {},
      });
      db.insertChunk({
        sessionId: "s1",
        turnIndex: 0,
        role: "user",
        content: "This is perfectly fine content that should not be cleaned up",
        metadata: {},
      });
      db.close();

      const result = runCli(`cleanup --apply-filters --yes --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("No low-quality chunks found");
    });
  });

  describe("--query mode", () => {
    it("should find and delete chunks matching query with --yes", () => {
      const db = seedForCleanup(tempDir);
      db.close();

      const result = runCli(`cleanup --query "SQLite" --yes --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Found");
      expect(result.stdout).toContain("Cleanup completed");
    });

    it("should show preview with --dry-run", () => {
      const db = seedForCleanup(tempDir);
      db.close();

      const result = runCli(`cleanup --query "SQLite" --dry-run --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Found");
      expect(result.stdout).toContain("Run without --dry-run to delete");
    });

    it("should report no matches when query finds nothing", () => {
      const db = seedForCleanup(tempDir);
      db.close();

      const result = runCli(
        `cleanup --query "nonexistent_pattern_xyz" --yes --cwd ${tempDir}`,
        tempDir,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("No chunks matching");
    });
  });

  describe("validation", () => {
    it("should reject --query and --apply-filters together", () => {
      const db = seedForCleanup(tempDir);
      db.close();

      const result = runCli(
        `cleanup --query "test" --apply-filters --yes --cwd ${tempDir}`,
        tempDir,
      );
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("Cannot use --query and --apply-filters together");
    });

    it("should require --yes in non-interactive mode when targets exist", () => {
      const db = seedForCleanup(tempDir);
      db.close();

      const result = runCli(`cleanup --apply-filters --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("--yes");
    });
  });

  describe("default mode (no --query or --apply-filters)", () => {
    it("should apply filters by default with --yes", () => {
      const db = seedForCleanup(tempDir);
      db.close();

      const result = runCli(`cleanup --yes --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Cleanup completed");
    });

    it("should apply filters by default with --dry-run", () => {
      const db = seedForCleanup(tempDir);
      db.close();

      const result = runCli(`cleanup --dry-run --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Found");
    });
  });
});
