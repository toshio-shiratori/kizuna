import { existsSync } from "node:fs";
import { Database, injectMemory, loadConfig } from "@kizuna/core";
import { resolveDbPath } from "../db-path.js";
import { loadPluginManager } from "../plugin-loader.js";
import { parseInput, formatError } from "./shared.js";

export async function handlePromptSubmit(): Promise<void> {
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
}
