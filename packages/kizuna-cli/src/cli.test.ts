import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { Database, captureTranscript } from "@kizuna/core";

const TSX_BIN = join(import.meta.dirname, "..", "node_modules", ".bin", "tsx");
const CLI_PATH = join(import.meta.dirname, "cli.ts");

function runCli(args: string, cwd: string): { stdout: string; exitCode: number } {
  try {
    const stdout = execSync(`${TSX_BIN} ${CLI_PATH} ${args}`, {
      cwd,
      encoding: "utf-8",
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });
    return { stdout, exitCode: 0 };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; status?: number };
    return {
      stdout: (e.stdout ?? "") + (e.stderr ?? ""),
      exitCode: e.status ?? 1,
    };
  }
}

function seedDatabase(cwd: string): Database {
  const kizunaDir = join(cwd, ".kizuna");
  mkdirSync(kizunaDir, { recursive: true });
  const db = new Database(join(kizunaDir, "memory.db"));

  captureTranscript(db, {
    sessionId: "test-session-001",
    projectId: "test-project",
    transcriptContent: [
      JSON.stringify({
        type: "summary",
        summary: "Test session",
        session_id: "test-session-001",
        timestamp: "2025-01-15T10:00:00Z",
      }),
      JSON.stringify({
        type: "human",
        message: {
          content: "TypeScriptでデータベース接続を実装してください",
        },
        timestamp: "2025-01-15T10:01:00Z",
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          content:
            "SQLiteのWALモードでデータベース接続を実装しました。better-sqlite3を使用しています。",
        },
        timestamp: "2025-01-15T10:02:00Z",
      }),
    ].join("\n"),
  });

  return db;
}

describe("CLI", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "kizuna-cli-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("setup", () => {
    it("should create .kizuna directory and configure hooks", () => {
      const result = runCli(`setup --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Kizuna hooks configured");
      expect(existsSync(join(tempDir, ".kizuna"))).toBe(true);
      expect(existsSync(join(tempDir, ".claude", "settings.json"))).toBe(true);

      const settings = JSON.parse(
        readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8"),
      ) as Record<string, unknown>;
      const hooks = settings["hooks"] as Record<string, unknown>;
      expect(hooks["SessionEnd"]).toBeDefined();
      expect(hooks["UserPromptSubmit"]).toBeDefined();
    });

    it("should preserve existing settings", () => {
      const claudeDir = join(tempDir, ".claude");
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(
        join(claudeDir, "settings.json"),
        JSON.stringify({ permissions: { allow: ["Bash(git *)"] } }),
      );

      const result = runCli(`setup --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);

      const settings = JSON.parse(
        readFileSync(join(claudeDir, "settings.json"), "utf-8"),
      ) as Record<string, unknown>;
      const permissions = settings["permissions"] as Record<string, unknown>;
      expect(permissions["allow"]).toContain("Bash(git *)");
      const hooks = settings["hooks"] as Record<string, unknown>;
      expect(hooks["SessionEnd"]).toBeDefined();
    });

    it("should inject usage guide into CLAUDE.md", () => {
      runCli(`setup --cwd ${tempDir}`, tempDir);
      const claudeMd = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
      expect(claudeMd).toContain("## Kizuna (Long-term Memory)");
      expect(claudeMd).toContain("kizuna search <query>");
      expect(claudeMd).toContain("kizuna stats");
    });

    it("should append to existing CLAUDE.md", () => {
      writeFileSync(join(tempDir, "CLAUDE.md"), "# My Project\n\nExisting content.\n");
      runCli(`setup --cwd ${tempDir}`, tempDir);
      const claudeMd = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
      expect(claudeMd).toContain("# My Project");
      expect(claudeMd).toContain("Existing content.");
      expect(claudeMd).toContain("## Kizuna (Long-term Memory)");
    });

    it("should not duplicate section on re-run", () => {
      runCli(`setup --cwd ${tempDir}`, tempDir);
      runCli(`setup --cwd ${tempDir}`, tempDir);
      const claudeMd = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
      const matches = claudeMd.match(/## Kizuna \(Long-term Memory\)/g);
      expect(matches).toHaveLength(1);
    });
  });

  describe("search", () => {
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
  });

  describe("list", () => {
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
  });

  describe("stats", () => {
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

  describe("prune", () => {
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
  });
});
