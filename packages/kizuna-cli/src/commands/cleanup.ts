import type { Command } from "commander";
import { Database, findLowQualityChunks, cleanupChunks, loadConfig } from "@kizuna/core";
import { resolveDbPath, dbExists } from "../db-path.js";
import { formatBytes } from "../utils/format.js";

export function registerCleanup(program: Command): void {
  program
    .command("cleanup")
    .description("Remove low-quality chunks from existing data")
    .option("--dry-run", "Show what would be deleted without actually deleting")
    .option("--cwd <path>", "Project directory", process.cwd())
    .action((opts: { dryRun?: boolean; cwd: string }) => {
      if (!dbExists(opts.cwd)) {
        console.error("No Kizuna database found. Run 'kizuna setup' first.");
        process.exitCode = 1;
        return;
      }

      const config = loadConfig(opts.cwd);
      const { cleanupPreviewLength, cleanupShowLimit } = config.display;
      const { noisePatterns } = config.pipeline;
      const db = new Database(resolveDbPath(opts.cwd));
      try {
        if (opts.dryRun) {
          const targets = findLowQualityChunks(db, noisePatterns);
          if (targets.length === 0) {
            console.log("No low-quality chunks found. Database is clean.");
            return;
          }

          const showCount = Math.min(targets.length, cleanupShowLimit);
          console.log(`Found ${targets.length} low-quality chunks:`);
          for (let i = 0; i < showCount; i++) {
            const t = targets[i]!;
            const preview = t.content.slice(0, cleanupPreviewLength).replace(/\n/g, " ");
            console.log(`  #${t.id} [${t.role}]  "${preview}"`);
          }
          if (targets.length > cleanupShowLimit) {
            console.log(`  (showing first ${cleanupShowLimit} of ${targets.length})`);
          }
          console.log("");
          console.log("Run without --dry-run to delete.");
        } else {
          const result = cleanupChunks(db, noisePatterns);
          if (result.chunksDeleted === 0) {
            console.log("No low-quality chunks found. Database is clean.");
            return;
          }

          console.log("Cleanup completed:");
          console.log(`  Chunks deleted:   ${result.chunksDeleted}`);
          console.log(`  Sessions deleted: ${result.sessionsDeleted}`);
          console.log(`  Space reclaimed:  ${formatBytes(result.bytesReclaimed)}`);
          console.log(`  Duration:         ${result.durationMs}ms`);
        }
      } finally {
        db.close();
      }
    });
}
