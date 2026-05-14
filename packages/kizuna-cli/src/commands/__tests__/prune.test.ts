import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runCli, seedDatabase, createTempDir, removeTempDir } from "../../test-utils.js";

describe("prune command", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  it("should prune old chunks", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`prune --older-than 0 --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Prune completed");
  });

  it("should reject invalid days", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`prune --older-than -1 --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("non-negative integer");
  });

  it("should report when no database exists", () => {
    const result = runCli(`prune --older-than 30 --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(1);
  });

  describe("validation", () => {
    it("should reject --older-than exceeding max for prune", () => {
      const db = seedDatabase(tempDir);
      db.close();

      const result = runCli(`prune --older-than 3651 --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("--older-than must be at most 3650");
    });

    it("should reject non-numeric --older-than for prune", () => {
      const db = seedDatabase(tempDir);
      db.close();

      const result = runCli(`prune --older-than abc --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("--older-than must be a non-negative integer");
    });
  });
});
