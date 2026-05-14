import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runCli, seedDatabase, createTempDir, removeTempDir } from "../../test-utils.js";

describe("stats command", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  it("should show database statistics", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`stats --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Sessions:");
    expect(result.stdout).toContain("Chunks:");
    expect(result.stdout).toContain("Size:");
  });

  it("should report when no database exists", () => {
    const result = runCli(`stats --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(1);
  });
});
