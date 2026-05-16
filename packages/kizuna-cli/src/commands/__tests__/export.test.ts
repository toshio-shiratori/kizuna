import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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

  it("should filter by --role user", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`export --role user --format json --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    for (const chunk of parsed.chunks) {
      expect(chunk.role).toBe("user");
    }
  });

  it("should filter by --role assistant", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`export --role assistant --format json --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    for (const chunk of parsed.chunks) {
      expect(chunk.role).toBe("assistant");
    }
  });

  it("should reject invalid --role", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`export --role system --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Invalid role");
  });

  it("should filter by --min-importance", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`export --min-importance 5 --format json --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    for (const chunk of parsed.chunks) {
      expect(chunk.importance).toBeGreaterThanOrEqual(5);
    }
  });

  it("should reject invalid --min-importance", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`export --min-importance -1 --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("--min-importance must be a non-negative integer");
  });

  it("should reject --min-importance exceeding 10", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`export --min-importance 11 --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("--min-importance must be at most 10");
  });

  it("should filter by --session", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(
      `export --session test-session-001 --format json --cwd ${tempDir}`,
      tempDir,
    );
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    for (const chunk of parsed.chunks) {
      expect(chunk.sessionId).toBe("test-session-001");
    }
  });

  it("should support multiple --session flags", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(
      `export --session test-session-001 --session non-existent --format json --cwd ${tempDir}`,
      tempDir,
    );
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    // Only test-session-001 exists, non-existent returns nothing
    for (const chunk of parsed.chunks) {
      expect(chunk.sessionId).toBe("test-session-001");
    }
  });

  it("should output with --no-metadata in markdown", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`export --no-metadata --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("# Kizuna Memory Export");
    expect(result.stdout).not.toContain("- **Project**:");
    expect(result.stdout).not.toContain("## [");
  });

  it("should output with --no-metadata in json", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`export --no-metadata --format json --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    for (const chunk of parsed.chunks) {
      expect(chunk.metadata).toBeUndefined();
    }
  });

  it("should write to file with --output", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const outputPath = `${tempDir}/export-output.md`;
    const result = runCli(`export --output ${outputPath} --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);

    const fileContent = readFileSync(outputPath, "utf-8");
    expect(fileContent).toContain("# Kizuna Memory Export");
  });

  it("should include new filters in metadata", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(
      `export --role assistant --min-importance 3 --session test-session-001 --format json --cwd ${tempDir}`,
      tempDir,
    );
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.meta.filters.role).toBe("assistant");
    expect(parsed.meta.filters.minImportance).toBe(3);
    expect(parsed.meta.filters.session).toEqual(["test-session-001"]);
  });
});

describe("export --project (multi-repo)", () => {
  let mainDir: string;
  let refDir: string;

  beforeEach(() => {
    mainDir = createTempDir();
    refDir = createTempDir();

    // Seed the referenced project's database
    const db = seedDatabase(refDir);
    db.close();
  });

  afterEach(() => {
    removeTempDir(mainDir);
    removeTempDir(refDir);
  });

  function setupPluginsJson(
    cwd: string,
    references: Array<{ name: string; dbPath: string }>,
  ): void {
    const kizunaDir = join(cwd, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    const pluginsJson = {
      plugins: {
        "/path/to/plugin-multi-repo-sharing/dist/index.js": {
          enabled: true,
          options: { references },
        },
      },
    };
    writeFileSync(join(kizunaDir, "plugins.json"), JSON.stringify(pluginsJson, null, 2));
  }

  it("should export from a referenced project database", () => {
    const refDbPath = join(refDir, ".kizuna", "memory.db");
    setupPluginsJson(mainDir, [{ name: "backend-api", dbPath: refDbPath }]);

    const result = runCli(`export --project backend-api --format json --cwd ${mainDir}`, mainDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.meta.projectId).toBe("backend-api");
    expect(parsed.meta.chunkCount).toBeGreaterThan(0);
    expect(parsed.meta.filters.project).toBe("backend-api");
  });

  it("should export from referenced project in markdown format", () => {
    const refDbPath = join(refDir, ".kizuna", "memory.db");
    setupPluginsJson(mainDir, [{ name: "backend-api", dbPath: refDbPath }]);

    const result = runCli(`export --project backend-api --cwd ${mainDir}`, mainDir);
    expect(result.exitCode).toBe(0);

    expect(result.stdout).toContain("# Kizuna Memory Export");
    expect(result.stdout).toContain("- **Project**: backend-api");
    expect(result.stdout).toContain("project=backend-api");
  });

  it("should error when project name is not found in references", () => {
    setupPluginsJson(mainDir, [
      { name: "backend-api", dbPath: join(refDir, ".kizuna", "memory.db") },
    ]);

    const result = runCli(`export --project unknown-project --cwd ${mainDir}`, mainDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Project "unknown-project" not found');
    expect(result.stdout).toContain("multi-repo-sharing plugin references");
  });

  it("should error when plugin is not configured", () => {
    // No plugins.json at all
    const kizunaDir = join(mainDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });

    const result = runCli(`export --project backend-api --cwd ${mainDir}`, mainDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Project "backend-api" not found');
  });

  it("should error when referenced DB does not exist", () => {
    setupPluginsJson(mainDir, [{ name: "backend-api", dbPath: "/nonexistent/path/memory.db" }]);

    const result = runCli(`export --project backend-api --cwd ${mainDir}`, mainDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Database not found for project "backend-api"');
  });

  it("should skip disabled plugins when resolving project", () => {
    const refDbPath = join(refDir, ".kizuna", "memory.db");
    const kizunaDir = join(mainDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    const pluginsJson = {
      plugins: {
        "/path/to/plugin-multi-repo-sharing/dist/index.js": {
          enabled: false,
          options: { references: [{ name: "backend-api", dbPath: refDbPath }] },
        },
      },
    };
    writeFileSync(join(kizunaDir, "plugins.json"), JSON.stringify(pluginsJson, null, 2));

    const result = runCli(`export --project backend-api --cwd ${mainDir}`, mainDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('Project "backend-api" not found');
  });

  it("should combine --project with other filters", () => {
    const refDbPath = join(refDir, ".kizuna", "memory.db");
    setupPluginsJson(mainDir, [{ name: "backend-api", dbPath: refDbPath }]);

    const result = runCli(
      `export --project backend-api --role assistant --format json --cwd ${mainDir}`,
      mainDir,
    );
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.meta.projectId).toBe("backend-api");
    for (const chunk of parsed.chunks) {
      expect(chunk.role).toBe("assistant");
    }
  });

  it("should not require local database when --project is used", () => {
    // mainDir has no .kizuna/memory.db, only plugins.json
    const refDbPath = join(refDir, ".kizuna", "memory.db");
    setupPluginsJson(mainDir, [{ name: "backend-api", dbPath: refDbPath }]);

    const result = runCli(`export --project backend-api --format json --cwd ${mainDir}`, mainDir);
    expect(result.exitCode).toBe(0);

    const parsed = JSON.parse(result.stdout);
    expect(parsed.meta.chunkCount).toBeGreaterThan(0);
  });
});
