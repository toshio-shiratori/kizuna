import type { Command } from "commander";
import { Database, runMaintenance } from "@kizuna/core";
import { resolveDbPath, dbExists } from "../db-path.js";
import { createNonNegativeIntParser } from "../validators.js";

export function registerPrune(program: Command): void {
  program
    .command("prune")
    .description("Remove old memory chunks")
    .requiredOption(
      "--older-than <days>",
      "Delete chunks older than N days (0-3650)",
      createNonNegativeIntParser("--older-than", 3650),
    )
    .option("--cwd <path>", "Project directory", process.cwd())
    .action((opts: { olderThan: number; cwd: string }) => {
      const days = opts.olderThan;

      if (!dbExists(opts.cwd)) {
        console.error("No Kizuna database found. Run 'kizuna setup' first.");
        process.exitCode = 1;
        return;
      }

      const db = new Database(resolveDbPath(opts.cwd));
      try {
        const result = runMaintenance(db, {
          retentionDays: days,
          throttleHours: 0,
        });

        if (result) {
          console.log("Prune completed:");
          console.log(`  Chunks deleted:   ${result.chunksDeleted}`);
          console.log(`  Sessions deleted: ${result.sessionsDeleted}`);
          console.log(`  Space reclaimed:  ${formatBytes(result.bytesReclaimed)}`);
          console.log(`  Duration:         ${result.durationMs}ms`);
        } else {
          console.log("Nothing to prune.");
        }
      } finally {
        db.close();
      }
    });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
