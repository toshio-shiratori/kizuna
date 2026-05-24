import type { Command } from "commander";
import { Database, SqlitePluginStorage } from "@kizuna/core";
import { resolveDbPath, dbExists } from "../../db-path.js";
import { findPlugin } from "./registry.js";

const PII_PLUGIN_NAME = "@kizuna/plugin-pii-sanitizer";
const PII_STATS_KEY = "stats";

interface PiiSanitizerStats {
  totalRedacted: number;
  byPattern: Record<string, number>;
  lastRedactedAt: string;
  sessionsWithRedactions: number;
}

function formatPiiSanitizerStats(stats: PiiSanitizerStats): void {
  console.log(`Plugin: ${PII_PLUGIN_NAME}`);
  console.log("─".repeat(40));
  console.log(`Total redacted:     ${stats.totalRedacted}`);
  console.log(`Sessions affected:  ${stats.sessionsWithRedactions}`);

  const patternEntries = Object.entries(stats.byPattern).sort(([, a], [, b]) => b - a);
  if (patternEntries.length > 0) {
    console.log("By pattern:");
    for (const [pattern, count] of patternEntries) {
      console.log(`  ${pattern.padEnd(20)} ${count}`);
    }
  }

  if (stats.lastRedactedAt) {
    console.log(`Last redacted:      ${stats.lastRedactedAt.split("T")[0]}`);
  }
}

export function registerStats(pluginCmd: Command): void {
  pluginCmd
    .command("stats <name>")
    .description("Show plugin statistics")
    .option("--cwd <path>", "Project directory", process.cwd())
    .action(async (name: string, opts: { cwd: string }) => {
      const pluginDef = findPlugin(name);
      if (!pluginDef) {
        console.error(`Unknown plugin: ${name}`);
        console.error('Run "kizuna plugin list" to see available plugins.');
        process.exitCode = 1;
        return;
      }

      if (!dbExists(opts.cwd)) {
        console.error("No Kizuna database found. Run 'kizuna setup' first.");
        process.exitCode = 1;
        return;
      }

      const db = new Database(resolveDbPath(opts.cwd));
      try {
        if (pluginDef.shortName === "pii-sanitizer") {
          const storage = new SqlitePluginStorage(db.getConnection(), PII_PLUGIN_NAME);
          const stats = await storage.get<PiiSanitizerStats>(PII_STATS_KEY);
          if (!stats) {
            console.log("No redaction statistics recorded yet.");
            return;
          }
          formatPiiSanitizerStats(stats);
        } else {
          console.log(`No statistics available for plugin: ${name}`);
        }
      } finally {
        db.close();
      }
    });
}
