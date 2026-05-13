import { existsSync } from "node:fs";
import { join } from "node:path";
import { Database, captureTranscript, runMaintenance } from "@kizuna/core";
import { resolveDbPath } from "../db-path.js";
import { loadPluginManager } from "../plugin-loader.js";
import { parseInput, getProjectId, formatError } from "./shared.js";

export async function handleSessionEnd(): Promise<void> {
  const input = parseInput();
  const kizunaDir = join(input.cwd, ".kizuna");

  if (!existsSync(kizunaDir)) {
    return;
  }

  if (!input.transcript_path || !existsSync(input.transcript_path)) {
    process.stderr.write(`kizuna: transcript not found: ${input.transcript_path || "(none)"}\n`);
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
}
