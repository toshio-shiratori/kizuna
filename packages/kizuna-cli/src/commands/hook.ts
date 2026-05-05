import type { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { Database, captureTranscript, injectMemory, runMaintenance } from "@kizuna/core";
import { resolveDbPath } from "../db-path.js";

interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  prompt?: string;
  source?: string;
}

function parseInput(): HookInput {
  try {
    const raw = readFileSync(0, "utf-8");
    return JSON.parse(raw) as HookInput;
  } catch {
    return { session_id: "", transcript_path: "", cwd: process.cwd(), hook_event_name: "" };
  }
}

function getProjectId(cwd: string): string {
  return basename(cwd);
}

export function registerHook(program: Command): void {
  const hook = program
    .command("hook")
    .description("Hook handlers invoked by Claude Code (internal use)");

  hook
    .command("session-end")
    .description("Capture transcript on session end")
    .action(() => {
      const input = parseInput();
      const kizunaDir = join(input.cwd, ".kizuna");

      if (!existsSync(kizunaDir)) {
        return;
      }

      if (!input.transcript_path || !existsSync(input.transcript_path)) {
        process.stderr.write(
          `kizuna: transcript not found: ${input.transcript_path || "(none)"}\n`,
        );
        return;
      }

      const db = new Database(resolveDbPath(input.cwd));
      try {
        const result = captureTranscript(db, {
          sessionId: input.session_id,
          projectId: getProjectId(input.cwd),
          transcriptPath: input.transcript_path,
        });

        if (result.chunksStored > 0) {
          process.stderr.write(
            `kizuna: captured ${result.chunksStored} chunks (${result.totalTokens} tokens)\n`,
          );
        }

        runMaintenance(db);
      } finally {
        db.close();
      }
    });

  hook
    .command("prompt-submit")
    .description("Inject relevant memories into prompt context")
    .action(() => {
      const input = parseInput();
      const dbPath = resolveDbPath(input.cwd);

      if (!existsSync(dbPath)) {
        return;
      }

      const prompt = input.prompt ?? "";
      if (prompt.trim().length === 0) {
        return;
      }

      const db = new Database(dbPath);
      try {
        const result = injectMemory(db, prompt);
        if (result.context.length > 0) {
          process.stdout.write(result.context);
        }
      } finally {
        db.close();
      }
    });

  hook
    .command("session-start")
    .description("Initialize session context")
    .action(() => {
      const input = parseInput();
      const dbPath = resolveDbPath(input.cwd);

      if (!existsSync(dbPath)) {
        return;
      }

      const db = new Database(dbPath);
      try {
        const chunkCount = (
          db.db.prepare("SELECT COUNT(*) AS count FROM chunks").get() as { count: number }
        ).count;
        const sessionCount = (
          db.db.prepare("SELECT COUNT(*) AS count FROM sessions").get() as { count: number }
        ).count;

        if (chunkCount > 0) {
          process.stderr.write(
            `kizuna: ${chunkCount} memories available (${sessionCount} sessions)\n`,
          );
        }
      } finally {
        db.close();
      }
    });
}
