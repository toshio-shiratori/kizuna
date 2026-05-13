import type { Command } from "commander";
import { Database } from "@kizuna/core";
import { resolveDbPath, dbExists } from "../db-path.js";
import { formatBytes } from "../utils/format.js";

interface CountRow {
  count: number;
}

export function registerStats(program: Command): void {
  program
    .command("stats")
    .description("Show database statistics")
    .option("--cwd <path>", "Project directory", process.cwd())
    .action((opts: { cwd: string }) => {
      if (!dbExists(opts.cwd)) {
        console.error("No Kizuna database found. Run 'kizuna setup' first.");
        process.exitCode = 1;
        return;
      }

      const db = new Database(resolveDbPath(opts.cwd));
      try {
        const chunkCount = (db.db.prepare("SELECT COUNT(*) AS count FROM chunks").get() as CountRow)
          .count;
        const sessionCount = (
          db.db.prepare("SELECT COUNT(*) AS count FROM sessions").get() as CountRow
        ).count;
        const dbSize = db.getDatabaseSizeBytes();
        const lastMaintenance = db.getLastMaintenanceRun();

        const oldestChunk = db.db
          .prepare("SELECT created_at FROM chunks ORDER BY created_at ASC LIMIT 1")
          .get() as { created_at: string } | undefined;
        const newestChunk = db.db
          .prepare("SELECT created_at FROM chunks ORDER BY created_at DESC LIMIT 1")
          .get() as { created_at: string } | undefined;

        console.log("Kizuna Database Statistics");
        console.log("─".repeat(40));
        console.log(`Database:     ${resolveDbPath(opts.cwd)}`);
        console.log(`Size:         ${formatBytes(dbSize)}`);
        console.log(`Sessions:     ${sessionCount}`);
        console.log(`Chunks:       ${chunkCount}`);
        if (oldestChunk) {
          console.log(`Oldest:       ${oldestChunk.created_at.split("T")[0]}`);
        }
        if (newestChunk) {
          console.log(`Newest:       ${newestChunk.created_at.split("T")[0]}`);
        }
        if (lastMaintenance) {
          console.log(`Last cleanup: ${lastMaintenance.ranAt.split("T")[0]}`);
        } else {
          console.log("Last cleanup: never");
        }
      } finally {
        db.close();
      }
    });
}
