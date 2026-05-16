import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { Database, captureTranscript } from "@kizuna/core";

const TSX_BIN = join(import.meta.dirname, "..", "node_modules", ".bin", "tsx");
const CLI_PATH = join(import.meta.dirname, "cli.ts");

export function runCli(
  args: string,
  cwd: string,
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync(`${TSX_BIN} ${CLI_PATH} ${args}`, {
    cwd,
    encoding: "utf-8",
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
    stdio: ["pipe", "pipe", "pipe"],
    shell: true,
  });

  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const exitCode = result.status ?? 1;

  if (exitCode !== 0) {
    // Keep backward compatibility: combine stdout + stderr for exitCode != 0
    return { stdout: stdout + stderr, stderr, exitCode };
  }

  return { stdout, stderr, exitCode };
}

export function seedDatabase(cwd: string): Database {
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

export function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "kizuna-cli-test-"));
}

export function removeTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}
