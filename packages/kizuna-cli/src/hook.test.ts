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
      type: "user",
      uuid: "hook-test-user-001",
      message: { role: "user", content: "SQLiteのWALモードについて教えてください" },
      timestamp: "2025-01-20T10:01:00Z",
    }),
    JSON.stringify({
      type: "assistant",
      uuid: "hook-test-assistant-001",
      message: {
        role: "assistant",
        content: "WALモードはWrite-Ahead Loggingの略で、SQLiteの並行読み取り性能を向上させます。",
      },
      timestamp: "2025-01-20T10:02:00Z",
    }),
  ];
  writeFileSync(transcriptPath, lines.join("\n"));
  return transcriptPath;
}

async function seedDatabase(cwd: string): Promise<void> {
  const kizunaDir = join(cwd, ".kizuna");
  mkdirSync(kizunaDir, { recursive: true });
  const db = new Database(join(kizunaDir, "memory.db"));

  await captureTranscript(db, {
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
        type: "user",
        uuid: "seed-user-001",
        message: { role: "user", content: "better-sqlite3でマイグレーションを実装してください" },
        timestamp: "2025-01-15T10:01:00Z",
      }),
      JSON.stringify({
        type: "assistant",
        uuid: "seed-assistant-001",
        message: {
          role: "assistant",
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
        const chunks = db.db
          .prepare("SELECT role FROM chunks WHERE session_id = ?")
          .all("test-session-123") as { role: string }[];
        expect(chunks.length).toBe(2);

        const roles = chunks.map((c) => c.role);
        expect(roles).toContain("user");
        expect(roles).toContain("assistant");

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
    it("should inject relevant memories when matches exist", async () => {
      await seedDatabase(tempDir);

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

    it("should output nothing when no memories match", async () => {
      await seedDatabase(tempDir);

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

    it("should silently exit when prompt is empty", async () => {
      await seedDatabase(tempDir);

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

  describe("stop", () => {
    it("should incrementally capture new turns", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const transcriptPath = createTranscript(tempDir);

      const result1 = runHook("stop", {
        session_id: "stop-test-session",
        transcript_path: transcriptPath,
        cwd: tempDir,
        hook_event_name: "Stop",
      });

      expect(result1.exitCode).toBe(0);

      const dbPath = join(kizunaDir, "memory.db");
      expect(existsSync(dbPath)).toBe(true);

      const db = new Database(dbPath);
      try {
        const chunks = db.db
          .prepare("SELECT role FROM chunks WHERE session_id = ?")
          .all("stop-test-session") as { role: string }[];
        expect(chunks.length).toBe(2);

        const roles = chunks.map((c) => c.role);
        expect(roles).toContain("user");
        expect(roles).toContain("assistant");
      } finally {
        db.close();
      }
    });

    it("should not duplicate chunks on repeated calls", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const transcriptPath = createTranscript(tempDir);

      const hookInput = {
        session_id: "stop-dedup-session",
        transcript_path: transcriptPath,
        cwd: tempDir,
        hook_event_name: "Stop",
      };

      runHook("stop", hookInput);
      runHook("stop", hookInput);

      const db = new Database(join(kizunaDir, "memory.db"));
      try {
        const chunks = db.getChunksBySession("stop-dedup-session");
        const transcriptChunkCount = chunks.length;
        expect(transcriptChunkCount).toBeGreaterThan(0);

        runHook("stop", hookInput);

        const chunksAfter = db.getChunksBySession("stop-dedup-session");
        expect(chunksAfter.length).toBe(transcriptChunkCount);
      } finally {
        db.close();
      }
    });

    it("should silently exit when .kizuna directory does not exist", () => {
      const result = runHook("stop", {
        session_id: "test-session",
        transcript_path: "/nonexistent/transcript.jsonl",
        cwd: tempDir,
        hook_event_name: "Stop",
      });

      expect(result.exitCode).toBe(0);
    });

    it("should work with session-end for the same session", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const transcriptPath = createTranscript(tempDir);

      const hookInput = {
        session_id: "stop-then-end-session",
        transcript_path: transcriptPath,
        cwd: tempDir,
      };

      runHook("stop", { ...hookInput, hook_event_name: "Stop" });
      runHook("session-end", { ...hookInput, hook_event_name: "SessionEnd" });

      const db = new Database(join(kizunaDir, "memory.db"));
      try {
        const chunks = db.getChunksBySession("stop-then-end-session");
        expect(chunks.length).toBeGreaterThan(0);

        const turnIndices = chunks.map((c) => c.turnIndex);
        const uniqueIndices = new Set(turnIndices);
        expect(uniqueIndices.size).toBe(turnIndices.length);
      } finally {
        db.close();
      }
    });
  });

  describe("session-start", () => {
    it("should report memory stats when database has data", async () => {
      await seedDatabase(tempDir);

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
      expect(hooks["Stop"]).toBeDefined();
    });
  });
});
