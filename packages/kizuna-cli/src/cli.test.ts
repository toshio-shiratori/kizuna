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

    it("should deploy recap skill to .claude/commands/", () => {
      runCli(`setup --cwd ${tempDir}`, tempDir);
      const recapPath = join(tempDir, ".claude", "commands", "recap.md");
      expect(existsSync(recapPath)).toBe(true);
      const content = readFileSync(recapPath, "utf-8");
      expect(content).toContain("name: recap");
      expect(content).toContain("kizuna recap --project <path>");
    });

    it("should overwrite recap skill on re-run", () => {
      runCli(`setup --cwd ${tempDir}`, tempDir);
      const recapPath = join(tempDir, ".claude", "commands", "recap.md");
      writeFileSync(recapPath, "old content");
      runCli(`setup --cwd ${tempDir}`, tempDir);
      const content = readFileSync(recapPath, "utf-8");
      expect(content).toContain("name: recap");
      expect(content).not.toContain("old content");
    });

    it("should not configure MCP server without --with-mcp", () => {
      runCli(`setup --cwd ${tempDir}`, tempDir);
      const settings = JSON.parse(
        readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8"),
      ) as Record<string, unknown>;
      expect(settings["mcpServers"]).toBeUndefined();
    });

    it("should configure MCP server with --with-mcp", () => {
      const result = runCli(`setup --with-mcp --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("MCP server configured");

      const settings = JSON.parse(
        readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8"),
      ) as Record<string, unknown>;
      const mcpServers = settings["mcpServers"] as Record<string, unknown>;
      expect(mcpServers["kizuna"]).toBeDefined();

      const kizunaServer = mcpServers["kizuna"] as {
        command: string;
        args: string[];
        env: Record<string, string>;
      };
      expect(kizunaServer.command).toBe("node");
      expect(kizunaServer.args[0]).toContain("main.js");
      expect(kizunaServer.env["KIZUNA_DB_PATH"]).toContain(".kizuna/memory.db");
      expect(kizunaServer.env["KIZUNA_PROJECT_DIR"]).toBe(tempDir);
    });

    it("should preserve existing mcpServers on re-run with --with-mcp", () => {
      const claudeDir = join(tempDir, ".claude");
      mkdirSync(claudeDir, { recursive: true });
      writeFileSync(
        join(claudeDir, "settings.json"),
        JSON.stringify({
          mcpServers: { other: { command: "other-server", args: [] } },
        }),
      );

      runCli(`setup --with-mcp --cwd ${tempDir}`, tempDir);
      const settings = JSON.parse(
        readFileSync(join(claudeDir, "settings.json"), "utf-8"),
      ) as Record<string, unknown>;
      const mcpServers = settings["mcpServers"] as Record<string, unknown>;
      expect(mcpServers["other"]).toBeDefined();
      expect(mcpServers["kizuna"]).toBeDefined();
    });

    it("should update kizuna MCP entry on re-run with --with-mcp", () => {
      runCli(`setup --with-mcp --cwd ${tempDir}`, tempDir);
      runCli(`setup --with-mcp --cwd ${tempDir}`, tempDir);
      const settings = JSON.parse(
        readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8"),
      ) as Record<string, unknown>;
      const mcpServers = settings["mcpServers"] as Record<string, unknown>;
      const keys = Object.keys(mcpServers);
      expect(keys.filter((k) => k === "kizuna")).toHaveLength(1);
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

  describe("recap", () => {
    it("should show the latest session chunks", () => {
      const db = seedDatabase(tempDir);
      db.close();

      const result = runCli(`recap --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("## Session:");
      expect(result.stdout).toContain("(project: test-project)");
      expect(result.stdout).toContain("**assistant**:");
      expect(result.stdout).toContain("SQLite");
    });

    it("should support --project option for cross-project sharing", () => {
      const otherDir = mkdtempSync(join(tmpdir(), "kizuna-cli-test-other-"));
      try {
        const db = seedDatabase(otherDir);
        db.close();

        const result = runCli(`recap --project ${otherDir}`, tempDir);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("## Session:");
        expect(result.stdout).toContain("test-project");
      } finally {
        rmSync(otherDir, { recursive: true, force: true });
      }
    });

    it("should report when no database exists", () => {
      const result = runCli(`recap --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("No Kizuna database found");
    });

    it("should report when no sessions with chunks exist", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.insertSession({
        id: "empty-session",
        projectId: "test",
        startedAt: new Date().toISOString(),
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      db.close();

      const result = runCli(`recap --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("No sessions with chunks found");
    });

    it("should skip empty sessions and show the one with chunks", () => {
      const db = seedDatabase(tempDir);
      db.insertSession({
        id: "empty-newer",
        projectId: "test-project",
        startedAt: "2099-01-01T00:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      db.close();

      const result = runCli(`recap --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("**assistant**:");
      expect(result.stdout).toContain("SQLite");
    });

    it("should limit output with --limit option", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.insertSession({
        id: "multi-chunk",
        projectId: "test",
        startedAt: "2025-01-01T00:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      for (let i = 0; i < 5; i++) {
        db.insertChunk({
          sessionId: "multi-chunk",
          turnIndex: i,
          role: i % 2 === 0 ? "user" : "assistant",
          content: `Message number ${i}`,
          metadata: {},
        });
      }
      db.close();

      const result = runCli(`recap --limit 2 --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Message number 3");
      expect(result.stdout).toContain("Message number 4");
      expect(result.stdout).not.toContain("Message number 0");
    });

    it("should apply default limit of 5 chunks", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.insertSession({
        id: "many-chunks",
        projectId: "test",
        startedAt: "2025-01-01T00:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      for (let i = 0; i < 10; i++) {
        db.insertChunk({
          sessionId: "many-chunks",
          turnIndex: i,
          role: i % 2 === 0 ? "user" : "assistant",
          content: `Chunk content ${i}`,
          metadata: {},
        });
      }
      db.close();

      const result = runCli(`recap --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Chunk content 5");
      expect(result.stdout).toContain("Chunk content 9");
      expect(result.stdout).not.toContain("Chunk content 4");
    });

    it("should show all chunks with --no-limit", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.insertSession({
        id: "all-chunks",
        projectId: "test",
        startedAt: "2025-01-01T00:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      for (let i = 0; i < 10; i++) {
        db.insertChunk({
          sessionId: "all-chunks",
          turnIndex: i,
          role: i % 2 === 0 ? "user" : "assistant",
          content: `All chunk ${i}`,
          metadata: {},
        });
      }
      db.close();

      const result = runCli(`recap --no-limit --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("All chunk 0");
      expect(result.stdout).toContain("All chunk 9");
    });

    it("should show multiple sessions with --sessions option", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.insertSession({
        id: "session-old",
        projectId: "test",
        startedAt: "2025-01-01T00:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      db.insertSession({
        id: "session-new",
        projectId: "test",
        startedAt: "2025-01-02T00:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      db.insertChunk({
        sessionId: "session-old",
        turnIndex: 0,
        role: "user",
        content: "Old session content here",
        metadata: {},
      });
      db.insertChunk({
        sessionId: "session-new",
        turnIndex: 0,
        role: "user",
        content: "New session content here",
        metadata: {},
      });
      db.close();

      const result = runCli(`recap --sessions 2 --no-limit --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Old session content here");
      expect(result.stdout).toContain("New session content here");
    });

    it("should show specific session with --session option", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.insertSession({
        id: "target-session",
        projectId: "test",
        startedAt: "2025-01-01T00:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      db.insertChunk({
        sessionId: "target-session",
        turnIndex: 0,
        role: "assistant",
        content: "Target session specific content",
        metadata: {},
      });
      db.close();

      const result = runCli(`recap --session target-session --no-limit --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Target session specific content");
    });

    it("should list sessions with --list option", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.insertSession({
        id: "list-sess-1",
        projectId: "proj-a",
        startedAt: "2025-01-01T10:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      db.insertSession({
        id: "list-sess-2",
        projectId: "proj-b",
        startedAt: "2025-02-01T08:30:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      db.insertChunk({
        sessionId: "list-sess-1",
        turnIndex: 0,
        role: "user",
        content: "Session one first chunk",
        metadata: {},
      });
      db.insertChunk({
        sessionId: "list-sess-2",
        turnIndex: 0,
        role: "user",
        content: "Session two first chunk",
        metadata: {},
      });
      db.close();

      const result = runCli(`recap --list --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Sessions with chunks:");
      expect(result.stdout).toContain("proj-b");
      expect(result.stdout).toContain("Session two first chunk");
      expect(result.stdout).toContain("proj-a");
      expect(result.stdout).toContain("Session one first chunk");
    });

    it("should show no sessions message with --list when empty", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.close();

      const result = runCli(`recap --list --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("No sessions with chunks found");
    });

    it("should support --list with --project option", () => {
      const otherDir = mkdtempSync(join(tmpdir(), "kizuna-cli-test-list-"));
      try {
        const kizunaDir = join(otherDir, ".kizuna");
        mkdirSync(kizunaDir, { recursive: true });
        const db = new Database(join(kizunaDir, "memory.db"));
        db.insertSession({
          id: "cross-list-sess",
          projectId: "other-proj",
          startedAt: "2025-03-01T12:00:00Z",
          endedAt: null,
          transcriptPath: null,
          metadata: {},
        });
        db.insertChunk({
          sessionId: "cross-list-sess",
          turnIndex: 0,
          role: "user",
          content: "Cross project content",
          metadata: {},
        });
        db.close();

        const result = runCli(`recap --list --project ${otherDir}`, tempDir);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("other-proj");
        expect(result.stdout).toContain("Cross project content");
      } finally {
        rmSync(otherDir, { recursive: true, force: true });
      }
    });

    it("should report error for non-existent session ID", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.close();

      const result = runCli(`recap --session nonexistent --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("Session not found");
    });

    describe("--session prefix match", () => {
      it("should match session by ID prefix", () => {
        const kizunaDir = join(tempDir, ".kizuna");
        mkdirSync(kizunaDir, { recursive: true });
        const db = new Database(join(kizunaDir, "memory.db"));
        db.insertSession({
          id: "abc-def-123",
          projectId: "test",
          startedAt: "2025-06-01T10:00:00Z",
          endedAt: null,
          transcriptPath: null,
          metadata: {},
        });
        db.insertChunk({
          sessionId: "abc-def-123",
          turnIndex: 0,
          role: "user",
          content: "Prefix match content",
          metadata: {},
        });
        db.close();

        const result = runCli(`recap --session abc-def --cwd ${tempDir}`, tempDir);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Prefix match content");
      });

      it("should show candidates when multiple sessions match prefix", () => {
        const kizunaDir = join(tempDir, ".kizuna");
        mkdirSync(kizunaDir, { recursive: true });
        const db = new Database(join(kizunaDir, "memory.db"));
        db.insertSession({
          id: "abc-111",
          projectId: "test",
          startedAt: "2025-06-01T10:00:00Z",
          endedAt: null,
          transcriptPath: null,
          metadata: {},
        });
        db.insertSession({
          id: "abc-222",
          projectId: "test",
          startedAt: "2025-06-02T10:00:00Z",
          endedAt: null,
          transcriptPath: null,
          metadata: {},
        });
        db.insertChunk({
          sessionId: "abc-111",
          turnIndex: 0,
          role: "user",
          content: "First match",
          metadata: {},
        });
        db.insertChunk({
          sessionId: "abc-222",
          turnIndex: 0,
          role: "user",
          content: "Second match",
          metadata: {},
        });
        db.close();

        const result = runCli(`recap --session abc --cwd ${tempDir}`, tempDir);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain('Multiple sessions match prefix "abc"');
        expect(result.stdout).toContain("abc-111");
        expect(result.stdout).toContain("abc-222");
        expect(result.stdout).toContain("Specify a longer prefix");
      });

      it("should report not found when prefix matches nothing", () => {
        const kizunaDir = join(tempDir, ".kizuna");
        mkdirSync(kizunaDir, { recursive: true });
        const db = new Database(join(kizunaDir, "memory.db"));
        db.close();

        const result = runCli(`recap --session zzz --cwd ${tempDir}`, tempDir);
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain("Session not found");
      });
    });

    describe("--date option", () => {
      it("should show sessions for a specific date", () => {
        const kizunaDir = join(tempDir, ".kizuna");
        mkdirSync(kizunaDir, { recursive: true });
        const db = new Database(join(kizunaDir, "memory.db"));
        db.insertSession({
          id: "date-session-1",
          projectId: "test",
          startedAt: "2025-03-15T09:00:00Z",
          endedAt: null,
          transcriptPath: null,
          metadata: {},
        });
        db.insertChunk({
          sessionId: "date-session-1",
          turnIndex: 0,
          role: "user",
          content: "Date filtered content",
          metadata: {},
        });
        db.close();

        const result = runCli(`recap --date 2025-03-15 --cwd ${tempDir}`, tempDir);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Date filtered content");
      });

      it("should show multiple sessions on the same date", () => {
        const kizunaDir = join(tempDir, ".kizuna");
        mkdirSync(kizunaDir, { recursive: true });
        const db = new Database(join(kizunaDir, "memory.db"));
        db.insertSession({
          id: "date-multi-1",
          projectId: "test",
          startedAt: "2025-04-10T09:00:00Z",
          endedAt: null,
          transcriptPath: null,
          metadata: {},
        });
        db.insertSession({
          id: "date-multi-2",
          projectId: "test",
          startedAt: "2025-04-10T14:00:00Z",
          endedAt: null,
          transcriptPath: null,
          metadata: {},
        });
        db.insertChunk({
          sessionId: "date-multi-1",
          turnIndex: 0,
          role: "user",
          content: "Morning session",
          metadata: {},
        });
        db.insertChunk({
          sessionId: "date-multi-2",
          turnIndex: 0,
          role: "user",
          content: "Afternoon session",
          metadata: {},
        });
        db.close();

        const result = runCli(`recap --date 2025-04-10 --cwd ${tempDir}`, tempDir);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("Sessions on 2025-04-10:");
        expect(result.stdout).toContain("date-multi-1");
        expect(result.stdout).toContain("date-multi-2");
      });

      it("should report no sessions when date has none", () => {
        const kizunaDir = join(tempDir, ".kizuna");
        mkdirSync(kizunaDir, { recursive: true });
        const db = new Database(join(kizunaDir, "memory.db"));
        db.close();

        const result = runCli(`recap --date 2099-12-31 --cwd ${tempDir}`, tempDir);
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toContain("No sessions with chunks found for 2099-12-31");
      });

      it("should reject invalid date format", () => {
        const kizunaDir = join(tempDir, ".kizuna");
        mkdirSync(kizunaDir, { recursive: true });
        const db = new Database(join(kizunaDir, "memory.db"));
        db.close();

        const result = runCli(`recap --date 2025/03/15 --cwd ${tempDir}`, tempDir);
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain("Invalid date format");
      });

      it("should reject semantically invalid date", () => {
        const kizunaDir = join(tempDir, ".kizuna");
        mkdirSync(kizunaDir, { recursive: true });
        const db = new Database(join(kizunaDir, "memory.db"));
        db.close();

        const result = runCli(`recap --date 2025-02-30 --cwd ${tempDir}`, tempDir);
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain("Invalid date format");
      });
    });

    describe("--last option", () => {
      it("should show the Nth most recent session", () => {
        const kizunaDir = join(tempDir, ".kizuna");
        mkdirSync(kizunaDir, { recursive: true });
        const db = new Database(join(kizunaDir, "memory.db"));
        db.insertSession({
          id: "last-old",
          projectId: "test",
          startedAt: "2025-01-01T00:00:00Z",
          endedAt: null,
          transcriptPath: null,
          metadata: {},
        });
        db.insertSession({
          id: "last-new",
          projectId: "test",
          startedAt: "2025-01-02T00:00:00Z",
          endedAt: null,
          transcriptPath: null,
          metadata: {},
        });
        db.insertChunk({
          sessionId: "last-old",
          turnIndex: 0,
          role: "user",
          content: "Older session content",
          metadata: {},
        });
        db.insertChunk({
          sessionId: "last-new",
          turnIndex: 0,
          role: "user",
          content: "Newer session content",
          metadata: {},
        });
        db.close();

        // --last 1 should show the most recent
        const result1 = runCli(`recap --last 1 --no-limit --cwd ${tempDir}`, tempDir);
        expect(result1.exitCode).toBe(0);
        expect(result1.stdout).toContain("Newer session content");
        expect(result1.stdout).not.toContain("Older session content");

        // --last 2 should show the second most recent
        const result2 = runCli(`recap --last 2 --no-limit --cwd ${tempDir}`, tempDir);
        expect(result2.exitCode).toBe(0);
        expect(result2.stdout).toContain("Older session content");
        expect(result2.stdout).not.toContain("Newer session content");
      });

      it("should report error when N exceeds available sessions", () => {
        const kizunaDir = join(tempDir, ".kizuna");
        mkdirSync(kizunaDir, { recursive: true });
        const db = new Database(join(kizunaDir, "memory.db"));
        db.insertSession({
          id: "only-session",
          projectId: "test",
          startedAt: "2025-01-01T00:00:00Z",
          endedAt: null,
          transcriptPath: null,
          metadata: {},
        });
        db.insertChunk({
          sessionId: "only-session",
          turnIndex: 0,
          role: "user",
          content: "Only content",
          metadata: {},
        });
        db.close();

        const result = runCli(`recap --last 5 --cwd ${tempDir}`, tempDir);
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain("Only 1 session(s) with chunks available");
      });

      it("should reject invalid --last value", () => {
        const kizunaDir = join(tempDir, ".kizuna");
        mkdirSync(kizunaDir, { recursive: true });
        const db = new Database(join(kizunaDir, "memory.db"));
        db.close();

        const result = runCli(`recap --last abc --cwd ${tempDir}`, tempDir);
        expect(result.exitCode).toBe(1);
        expect(result.stdout).toContain("--last must be a positive integer");
      });
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
