import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runCli, seedDatabase, createTempDir, removeTempDir } from "../../test-utils.js";

describe("list command", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  it("should list recent chunks", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`list --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("chunk(s)");
  });

  it("should filter by session", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`list --session test-session-001 --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("chunk(s) in session");
  });

  it("should report when no database exists", () => {
    const result = runCli(`list --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(1);
  });

  describe("validation", () => {
    it("should reject --limit exceeding max for list", () => {
      const db = seedDatabase(tempDir);
      db.close();

      const result = runCli(`list --limit 1001 --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("--limit must be at most 1000");
    });

    it("should accept valid --limit for list", () => {
      const db = seedDatabase(tempDir);
      db.close();

      const result = runCli(`list --limit 5 --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
    });
  });
});
