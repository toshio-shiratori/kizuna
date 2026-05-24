import type { Command } from "commander";
import { Database, SqlitePluginStorage } from "@kizuna/core";
import { resolveDbPath, dbExists } from "../db-path.js";
import { formatBytes } from "../utils/format.js";

const PII_PLUGIN_NAME = "@kizuna/plugin-pii-sanitizer";
const PII_STATS_KEY = "stats";

interface PiiSanitizerStats {
  totalRedacted: number;
  byPattern: Record<string, number>;
  lastRedactedAt: string;
  sessionsWithRedactions: number;
}

export function registerStats(program: Command): void {
  program
    .command("stats")
    .description("Show database statistics")
    .option("--cwd <path>", "Project directory", process.cwd())
    .action(async (opts: { cwd: string }) => {
      if (!dbExists(opts.cwd)) {
        console.error("No Kizuna database found. Run 'kizuna setup' first.");
        process.exitCode = 1;
        return;
      }

      const db = new Database(resolveDbPath(opts.cwd));
      try {
        const stats = db.getStats();

        console.log("Kizuna Database Statistics");
        console.log("─".repeat(40));
        console.log(`Database:     ${resolveDbPath(opts.cwd)}`);
        console.log(`Size:         ${formatBytes(stats.databaseSizeBytes)}`);
        console.log(`Sessions:     ${stats.sessionCount}`);
        console.log(`Chunks:       ${stats.chunkCount}`);
        if (stats.oldestChunkDate) {
          console.log(`Oldest:       ${stats.oldestChunkDate.split("T")[0]}`);
        }
        if (stats.newestChunkDate) {
          console.log(`Newest:       ${stats.newestChunkDate.split("T")[0]}`);
        }
        if (stats.lastMaintenanceAt) {
          console.log(`Last cleanup: ${stats.lastMaintenanceAt.split("T")[0]}`);
        } else {
          console.log("Last cleanup: never");
        }

        // Plugin statistics
        const piiStorage = new SqlitePluginStorage(db.getConnection(), PII_PLUGIN_NAME);
        const piiStats = await piiStorage.get<PiiSanitizerStats>(PII_STATS_KEY);
        if (piiStats) {
          console.log("");
          console.log("Plugin: pii-sanitizer");
          console.log("─".repeat(40));
          console.log(`Redacted:     ${piiStats.totalRedacted} items`);
          console.log(`Sessions:     ${piiStats.sessionsWithRedactions} affected`);
          if (piiStats.lastRedactedAt) {
            console.log(`Last redact:  ${piiStats.lastRedactedAt.split("T")[0]}`);
          }
        }
      } finally {
        db.close();
      }
    });
}
