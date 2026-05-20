import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  Database,
  captureTranscript,
  runMaintenance,
  loadConfig,
  SqlitePluginStorage,
} from "@kizuna/core";
import { resolveDbPath } from "../db-path.js";
import { loadPluginManager } from "../plugin-loader.js";
import { parseInput, getProjectId, formatError } from "./shared.js";

const PII_PLUGIN_NAME = "@kizuna/plugin-pii-sanitizer";
const PII_STATS_KEY = "stats";

interface PiiSanitizerStats {
  totalRedacted: number;
  byPattern: Record<string, number>;
  lastRedactedAt: string;
  sessionsWithRedactions: number;
}

export function formatRedactionSummary(
  before: PiiSanitizerStats | null,
  after: PiiSanitizerStats | null,
): string | null {
  if (!after) return null;

  const diffTotal = after.totalRedacted - (before?.totalRedacted ?? 0);
  if (diffTotal <= 0) return null;

  const beforeByPattern = before?.byPattern ?? {};
  const diffs: string[] = [];
  for (const [pattern, count] of Object.entries(after.byPattern)) {
    const diff = count - (beforeByPattern[pattern] ?? 0);
    if (diff > 0) {
      diffs.push(`${pattern}: ${diff}`);
    }
  }

  const detail = diffs.length > 0 ? ` (${diffs.join(", ")})` : "";
  return `kizuna: pii-sanitizer redacted ${diffTotal} items${detail}\n`;
}

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
    const config = loadConfig(input.cwd);

    // Read pre-capture stats for pii-sanitizer diff
    const piiStorage = new SqlitePluginStorage(db.db, PII_PLUGIN_NAME);
    const statsBefore = await piiStorage.get<PiiSanitizerStats>(PII_STATS_KEY);

    const result = await captureTranscript(db, {
      sessionId: input.session_id,
      projectId: getProjectId(input.cwd),
      transcriptPath: input.transcript_path,
      pluginManager,
      noisePatterns: config.pipeline.noisePatterns,
      maxChunkSize: config.pipeline.maxChunkSize,
    });

    if (result.chunksStored > 0) {
      process.stderr.write(
        `kizuna: captured ${result.chunksStored} chunks (${result.totalTokens} tokens)\n`,
      );
    }

    // Output pii-sanitizer redaction summary if any
    const statsAfter = await piiStorage.get<PiiSanitizerStats>(PII_STATS_KEY);
    const summary = formatRedactionSummary(statsBefore, statsAfter);
    if (summary) {
      process.stderr.write(summary);
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
