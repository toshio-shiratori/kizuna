import { mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { Database, captureTranscript } from "@kizuna/core";

const TSX_BIN = join(import.meta.dirname, "..", "node_modules", ".bin", "tsx");
const CLI_PATH = join(import.meta.dirname, "cli.ts");

export function runCli(args: string, cwd: string): { stdout: string; exitCode: number } {
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
