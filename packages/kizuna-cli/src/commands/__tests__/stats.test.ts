import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { SqlitePluginStorage } from "@kizuna/core";
import { runCli, seedDatabase, createTempDir, removeTempDir } from "../../test-utils.js";

const PII_PLUGIN_NAME = "@kizuna/plugin-pii-sanitizer";
const PII_STATS_KEY = "stats";

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

  it("should show pii-sanitizer stats when data exists", async () => {
    const db = seedDatabase(tempDir);
    const storage = new SqlitePluginStorage(db.getConnection(), PII_PLUGIN_NAME);
    await storage.set(PII_STATS_KEY, {
      totalRedacted: 15,
      byPattern: { anthropic_key: 8, github_token: 5, generic_secret: 2 },
      lastRedactedAt: "2025-06-01T12:00:00Z",
      sessionsWithRedactions: 3,
    });
    db.close();

    const result = runCli(`stats --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Plugin: pii-sanitizer");
    expect(result.stdout).toContain("Redacted:     15 items");
    expect(result.stdout).toContain("Sessions:     3 affected");
    expect(result.stdout).toContain("Last redact:  2025-06-01");
  });

  it("should not show pii-sanitizer section when no stats exist", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`stats --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).not.toContain("Plugin: pii-sanitizer");
  });
});

describe("plugin stats command", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  it("should show pii-sanitizer stats", async () => {
    const db = seedDatabase(tempDir);
    const storage = new SqlitePluginStorage(db.getConnection(), PII_PLUGIN_NAME);
    await storage.set(PII_STATS_KEY, {
      totalRedacted: 10,
      byPattern: { anthropic_key: 6, github_token: 4 },
      lastRedactedAt: "2025-05-15T10:00:00Z",
      sessionsWithRedactions: 2,
    });
    db.close();

    const result = runCli(`plugin stats pii-sanitizer --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Plugin: @kizuna/plugin-pii-sanitizer");
    expect(result.stdout).toContain("Total redacted:     10");
    expect(result.stdout).toContain("Sessions affected:  2");
    expect(result.stdout).toContain("By pattern:");
    expect(result.stdout).toContain("anthropic_key");
    expect(result.stdout).toContain("github_token");
    expect(result.stdout).toContain("Last redacted:      2025-05-15");
  });

  it("should report when no stats exist", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`plugin stats pii-sanitizer --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No redaction statistics recorded yet.");
  });

  it("should report no stats for unsupported plugins", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`plugin stats multi-repo-sharing --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No statistics available for plugin: multi-repo-sharing");
  });

  it("should error on unknown plugin", () => {
    const result = runCli(`plugin stats nonexistent --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Unknown plugin: nonexistent");
  });

  it("should error when no database exists", () => {
    const result = runCli(`plugin stats pii-sanitizer --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(1);
  });

  it("should sort patterns by count descending", async () => {
    const db = seedDatabase(tempDir);
    const storage = new SqlitePluginStorage(db.getConnection(), PII_PLUGIN_NAME);
    await storage.set(PII_STATS_KEY, {
      totalRedacted: 20,
      byPattern: { generic_secret: 2, anthropic_key: 12, github_token: 6 },
      lastRedactedAt: "2025-05-15T10:00:00Z",
      sessionsWithRedactions: 5,
    });
    db.close();

    const result = runCli(`plugin stats pii-sanitizer --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    const lines = result.stdout.split("\n");
    const patternLines = lines.filter(
      (l) =>
        l.includes("anthropic_key") || l.includes("github_token") || l.includes("generic_secret"),
    );
    expect(patternLines.length).toBe(3);
    // anthropic_key (12) should come before github_token (6) and generic_secret (2)
    const anthropicIdx = lines.findIndex((l) => l.includes("anthropic_key"));
    const githubIdx = lines.findIndex((l) => l.includes("github_token"));
    const genericIdx = lines.findIndex((l) => l.includes("generic_secret"));
    expect(anthropicIdx).toBeLessThan(githubIdx);
    expect(githubIdx).toBeLessThan(genericIdx);
  });
});
