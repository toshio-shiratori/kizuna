import type { Command } from "commander";
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import {
  Database,
  captureTranscript,
  injectMemory,
  runMaintenance,
  loadConfig,
} from "@kizuna/core";
import { resolveDbPath } from "../db-path.js";
import { loadPluginManager } from "../plugin-loader.js";

interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  prompt?: string;
  source?: string;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function parseInput(): HookInput {
  try {
    const raw = readFileSync(0, "utf-8");
    return JSON.parse(raw) as HookInput;
  } catch (error) {
    process.stderr.write(`kizuna: failed to parse hook input: ${formatError(error)}\n`);
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
    .action(async () => {
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

      let db: Database | undefined;
      let pluginManager: Awaited<ReturnType<typeof loadPluginManager>> | undefined;
      try {
        db = new Database(resolveDbPath(input.cwd));
        pluginManager = await loadPluginManager(db, input.cwd, "capture");

        const result = await captureTranscript(db, {
          sessionId: input.session_id,
          projectId: getProjectId(input.cwd),
          transcriptPath: input.transcript_path,
          pluginManager,
        });

        if (result.chunksStored > 0) {
          process.stderr.write(
            `kizuna: captured ${result.chunksStored} chunks (${result.totalTokens} tokens)\n`,
          );
        }

        runMaintenance(db);
      } catch (error) {
        process.stderr.write(`kizuna: session-end failed: ${formatError(error)}\n`);
        process.exitCode = 1;
      } finally {
        await pluginManager?.shutdownAll();
        db?.close();
      }
    });

  hook
    .command("prompt-submit")
    .description("Inject relevant memories into prompt context")
    .action(async () => {
      const input = parseInput();
      const dbPath = resolveDbPath(input.cwd);

      if (!existsSync(dbPath)) {
        return;
      }

      const prompt = input.prompt ?? "";
      if (prompt.trim().length === 0) {
        return;
      }

      let db: Database | undefined;
      let pluginManager: Awaited<ReturnType<typeof loadPluginManager>> | undefined;
      try {
        db = new Database(dbPath);
        pluginManager = await loadPluginManager(db, input.cwd, "search");

        const config = loadConfig(input.cwd);
        const result = await injectMemory(db, prompt, {
          pluginManager,
          tokenBudget: config.pipeline.tokenBudget,
          maxResults: config.pipeline.maxResults,
          halfLifeDays: config.pipeline.halfLifeDays,
        });
        if (result.context.length > 0) {
          process.stdout.write(result.context);
        }
      } catch (error) {
        process.stderr.write(`kizuna: prompt-submit failed: ${formatError(error)}\n`);
      } finally {
        await pluginManager?.shutdownAll();
        db?.close();
      }
    });

  hook
    .command("stop")
    .description("Incrementally capture new turns on assistant stop")
    .action(async () => {
      const input = parseInput();
      const kizunaDir = join(input.cwd, ".kizuna");

      if (!existsSync(kizunaDir)) {
        return;
      }

      if (!input.transcript_path || !existsSync(input.transcript_path)) {
        return;
      }

      let db: Database | undefined;
      let pluginManager: Awaited<ReturnType<typeof loadPluginManager>> | undefined;
      try {
        db = new Database(resolveDbPath(input.cwd));
        pluginManager = await loadPluginManager(db, input.cwd, "capture");

        const result = await captureTranscript(db, {
          sessionId: input.session_id,
          projectId: getProjectId(input.cwd),
          transcriptPath: input.transcript_path,
          pluginManager,
        });

        if (result.chunksStored > 0) {
          process.stderr.write(
            `kizuna: incremental capture ${result.chunksStored} chunks (${result.totalTokens} tokens)\n`,
          );
        }
      } catch (error) {
        process.stderr.write(`kizuna: stop failed: ${formatError(error)}\n`);
        process.exitCode = 1;
      } finally {
        await pluginManager?.shutdownAll();
        db?.close();
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

      let db: Database | undefined;
      try {
        db = new Database(dbPath);
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
      } catch (error) {
        process.stderr.write(`kizuna: session-start failed: ${formatError(error)}\n`);
      } finally {
        db?.close();
      }
    });
}
