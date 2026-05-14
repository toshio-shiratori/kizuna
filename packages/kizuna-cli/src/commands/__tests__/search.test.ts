import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runCli, seedDatabase, createTempDir, removeTempDir } from "../../test-utils.js";

describe("search command", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  it("should find relevant chunks", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`search "SQLite" --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("result(s) found");
  });

  it("should handle Japanese queries", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`search "データベース" --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("result(s) found");
  });

  it("should report when no database exists", () => {
    const result = runCli(`search "test" --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("No Kizuna database found");
  });

  it("should report when no results found", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`search "xyznonexistentquery" --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No results found");
  });

  describe("validation", () => {
    it("should reject --limit exceeding max for search", () => {
      const db = seedDatabase(tempDir);
      db.close();

      const result = runCli(`search "test" --limit 1001 --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("--limit must be at most 1000");
    });

    it("should reject non-numeric --limit for search", () => {
      const db = seedDatabase(tempDir);
      db.close();

      const result = runCli(`search "test" --limit abc --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("--limit must be a positive integer");
    });

    it("should reject zero --limit for search", () => {
      const db = seedDatabase(tempDir);
      db.close();

      const result = runCli(`search "test" --limit 0 --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("--limit must be a positive integer");
    });

    it("should accept valid --limit for search", () => {
      const db = seedDatabase(tempDir);
      db.close();

      const result = runCli(`search "SQLite" --limit 5 --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
    });
  });
});
