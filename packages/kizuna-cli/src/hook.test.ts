import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync, execSync } from "node:child_process";
import { Database, captureTranscript } from "@kizuna/core";

const TSX_BIN = join(import.meta.dirname, "..", "node_modules", ".bin", "tsx");
const CLI_PATH = join(import.meta.dirname, "cli.ts");

function runHook(
  subcommand: string,
  stdinJson: Record<string, unknown>,
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync(TSX_BIN, [CLI_PATH, "hook", subcommand], {
    input: JSON.stringify(stdinJson),
    encoding: "utf-8",
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? 1,
  };
}

function createTranscript(dir: string): string {
  const transcriptPath = join(dir, "transcript.jsonl");
  const lines = [
    JSON.stringify({
      type: "summary",
      summary: "Test session about TypeScript",
      session_id: "hook-test-session",
      timestamp: "2025-01-20T10:00:00Z",
    }),
    JSON.stringify({
      type: "human",
      message: { content: "SQLiteのWALモードについて教えてください" },
      timestamp: "2025-01-20T10:01:00Z",
    }),
    JSON.stringify({
      type: "assistant",
      message: {
        content: "WALモードはWrite-Ahead Loggingの略で、SQLiteの並行読み取り性能を向上させます。",
      },
      timestamp: "2025-01-20T10:02:00Z",
    }),
  ];
  writeFileSync(transcriptPath, lines.join("\n"));
  return transcriptPath;
}

function seedDatabase(cwd: string): void {
  const kizunaDir = join(cwd, ".kizuna");
  mkdirSync(kizunaDir, { recursive: true });
  const db = new Database(join(kizunaDir, "memory.db"));

  captureTranscript(db, {
    sessionId: "seed-session-001",
    projectId: "test-project",
    transcriptContent: [
      JSON.stringify({
        type: "summary",
        summary: "Database design session",
        session_id: "seed-session-001",
        timestamp: "2025-01-15T10:00:00Z",
      }),
      JSON.stringify({
        type: "human",
        message: { content: "better-sqlite3でマイグレーションを実装してください" },
        timestamp: "2025-01-15T10:01:00Z",
      }),
      JSON.stringify({
        type: "assistant",
        message: {
          content:
            "schema_versionsテーブルでバージョン管理を行い、未適用のSQLファイルを順番に実行する実装にしました。",
        },
        timestamp: "2025-01-15T10:02:00Z",
      }),
    ].join("\n"),
  });

  db.close();
}

describe("Hook handlers", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "kizuna-hook-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("session-end", () => {
    it("should capture transcript and store chunks", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const transcriptPath = createTranscript(tempDir);

      const result = runHook("session-end", {
        session_id: "test-session-123",
        transcript_path: transcriptPath,
        cwd: tempDir,
        hook_event_name: "SessionEnd",
      });

      expect(result.exitCode).toBe(0);

      const dbPath = join(kizunaDir, "memory.db");
      expect(existsSync(dbPath)).toBe(true);

      const db = new Database(dbPath);
      try {
        const count = (
          db.db.prepare("SELECT COUNT(*) AS count FROM chunks").get() as { count: number }
        ).count;
        expect(count).toBeGreaterThan(0);

        const session = db.db
          .prepare("SELECT * FROM sessions WHERE id = ?")
          .get("test-session-123") as { id: string } | undefined;
        expect(session).toBeDefined();
      } finally {
        db.close();
      }
    });

    it("should silently exit when .kizuna directory does not exist", () => {
      const result = runHook("session-end", {
        session_id: "test-session",
        transcript_path: "/nonexistent/transcript.jsonl",
        cwd: tempDir,
        hook_event_name: "SessionEnd",
      });

      expect(result.exitCode).toBe(0);
    });

    it("should handle missing transcript gracefully", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });

      const result = runHook("session-end", {
        session_id: "test-session",
        transcript_path: "/nonexistent/transcript.jsonl",
        cwd: tempDir,
        hook_event_name: "SessionEnd",
      });

      expect(result.exitCode).toBe(0);
    });
  });

  describe("prompt-submit", () => {
    it("should inject relevant memories when matches exist", () => {
      seedDatabase(tempDir);

      const result = runHook("prompt-submit", {
        session_id: "current-session",
        transcript_path: "",
        cwd: tempDir,
        hook_event_name: "UserPromptSubmit",
        prompt: "schema_versions バージョン管理",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Relevant Memories");
    });

    it("should output nothing when no memories match", () => {
      seedDatabase(tempDir);

      const result = runHook("prompt-submit", {
        session_id: "current-session",
        transcript_path: "",
        cwd: tempDir,
        hook_event_name: "UserPromptSubmit",
        prompt: "xyznonexistentquery123",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
    });

    it("should silently exit when no database exists", () => {
      const result = runHook("prompt-submit", {
        session_id: "current-session",
        transcript_path: "",
        cwd: tempDir,
        hook_event_name: "UserPromptSubmit",
        prompt: "test query",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
    });

    it("should silently exit when prompt is empty", () => {
      seedDatabase(tempDir);

      const result = runHook("prompt-submit", {
        session_id: "current-session",
        transcript_path: "",
        cwd: tempDir,
        hook_event_name: "UserPromptSubmit",
        prompt: "",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
    });
  });

  describe("session-start", () => {
    it("should report memory stats when database has data", () => {
      seedDatabase(tempDir);

      const result = runHook("session-start", {
        session_id: "new-session",
        transcript_path: "",
        cwd: tempDir,
        hook_event_name: "SessionStart",
        source: "startup",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stderr).toContain("memories available");
      expect(result.stderr).toContain("sessions");
    });

    it("should silently exit when no database exists", () => {
      const result = runHook("session-start", {
        session_id: "new-session",
        transcript_path: "",
        cwd: tempDir,
        hook_event_name: "SessionStart",
        source: "startup",
      });

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe("");
    });
  });

  describe("setup integration", () => {
    it("should register all three hooks via setup command", () => {
      execSync(`${TSX_BIN} ${CLI_PATH} setup --cwd ${tempDir}`, {
        encoding: "utf-8",
        env: { ...process.env, NODE_NO_WARNINGS: "1" },
      });

      const settingsPath = join(tempDir, ".claude", "settings.json");
      const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as Record<string, unknown>;
      const hooks = settings["hooks"] as Record<string, unknown>;

      expect(hooks["SessionStart"]).toBeDefined();
      expect(hooks["SessionEnd"]).toBeDefined();
      expect(hooks["UserPromptSubmit"]).toBeDefined();
    });
  });
});
