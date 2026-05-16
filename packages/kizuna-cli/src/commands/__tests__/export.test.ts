import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { runCli, seedDatabase, createTempDir, removeTempDir } from "../../test-utils.js";

describe("export command", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  it("should export in markdown format by default", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`export --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# Kizuna Memory Export");
    expect(result.stdout).toContain("- **Project**:");
    expect(result.stdout).toContain("- **Chunks**:");
  });

  it("should export in JSON format", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`export --format json --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.meta).toBeDefined();
    expect(parsed.chunks).toBeDefined();
    expect(parsed.meta.chunkCount).toBeGreaterThan(0);
  });

  it("should filter by --since", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(
      `export --since 2025-01-15T10:01:30Z --format json --cwd ${tempDir}`,
      tempDir,
    );
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    for (const chunk of parsed.chunks) {
      expect(chunk.createdAt >= "2025-01-15T10:01:30").toBe(true);
    }
  });

  it("should filter by --until", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(
      `export --until 2025-01-15T10:01:30Z --format json --cwd ${tempDir}`,
      tempDir,
    );
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    for (const chunk of parsed.chunks) {
      expect(chunk.createdAt <= "2025-01-15T10:01:30").toBe(true);
    }
  });

  it("should support relative dates in --since", () => {
    const db = seedDatabase(tempDir);
    db.close();

    // Use a very large relative date to include all test data
    const result = runCli(`export --since 365d --format json --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.meta.chunkCount).toBeGreaterThanOrEqual(0);
  });

  it("should apply --limit", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`export --limit 1 --format json --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.chunks.length).toBeLessThanOrEqual(1);
  });

  it("should filter by --query", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`export --query "SQLite" --format json --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    if (parsed.chunks.length > 0) {
      const hasSqlite = parsed.chunks.some((c: { content: string }) =>
        c.content.toLowerCase().includes("sqlite"),
      );
      expect(hasSqlite).toBe(true);
    }
  });

  it("should report when no database exists", () => {
    const result = runCli(`export --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("No Kizuna database found");
  });

  it("should reject invalid format", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`export --format csv --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Invalid format");
  });

  it("should reject invalid --limit", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`export --limit 0 --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("--limit must be a positive integer");
  });

  it("should reject --limit exceeding max", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`export --limit 10001 --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("--limit must be at most 10000");
  });
});
