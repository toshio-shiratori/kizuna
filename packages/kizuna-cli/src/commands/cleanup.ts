import { createInterface } from "node:readline";
import type { Command } from "commander";
import {
  Database,
  findLowQualityChunks,
  findChunksByQuery,
  executeCleanup,
  loadConfig,
} from "@kizuna/core";
import type { CleanupTarget } from "@kizuna/core";
import { resolveDbPath, dbExists } from "../db-path.js";
import { formatBytes } from "../utils/format.js";

function confirmPrompt(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}

interface CleanupOptions {
  query?: string;
  applyFilters?: boolean;
  dryRun?: boolean;
  yes?: boolean;
  cwd: string;
}

export function registerCleanup(program: Command): void {
  program
    .command("cleanup")
    .description("Remove low-quality or matching chunks from existing data")
    .option("--query <text>", "Delete chunks matching a search query")
    .option("--apply-filters", "Apply built-in and user-defined noise filters to existing chunks")
    .option("--dry-run", "Show what would be deleted without actually deleting")
    .option("--yes", "Skip confirmation prompt")
    .option("--cwd <path>", "Project directory", process.cwd())
    .action(async (opts: CleanupOptions) => {
      if (opts.query && opts.applyFilters) {
        console.error("Cannot use --query and --apply-filters together.");
        process.exitCode = 1;
        return;
      }

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
        const targets: CleanupTarget[] = opts.query
          ? findChunksByQuery(db, opts.query)
          : findLowQualityChunks(db, noisePatterns);

        const modeLabel = opts.query ? `query "${opts.query}"` : "noise filters";

        if (targets.length === 0) {
          console.log(
            opts.query
              ? `No chunks matching "${opts.query}" found.`
              : "No low-quality chunks found. Database is clean.",
          );
          return;
        }

        const showCount = Math.min(targets.length, cleanupShowLimit);
        console.log(`Found ${targets.length} chunks matching ${modeLabel}:`);
        for (let i = 0; i < showCount; i++) {
          const t = targets[i]!;
          const preview = t.content.slice(0, cleanupPreviewLength).replace(/\n/g, " ");
          console.log(`  #${t.id} [${t.role}]  "${preview}"`);
        }
        if (targets.length > cleanupShowLimit) {
          console.log(`  (showing first ${cleanupShowLimit} of ${targets.length})`);
        }

        if (opts.dryRun) {
          console.log("");
          console.log("Run without --dry-run to delete.");
          return;
        }

        if (!opts.yes) {
          if (!process.stdin.isTTY) {
            console.error("");
            console.error("Use --yes to confirm deletion in non-interactive mode.");
            process.exitCode = 1;
            return;
          }

          const confirmed = await confirmPrompt(`\nDelete ${targets.length} chunks? [y/N] `);
          if (!confirmed) {
            console.log("Aborted.");
            return;
          }
        }

        const result = executeCleanup(db, targets);
        console.log("");
        console.log("Cleanup completed:");
        console.log(`  Chunks deleted:   ${result.chunksDeleted}`);
        console.log(`  Sessions deleted: ${result.sessionsDeleted}`);
        console.log(`  Space reclaimed:  ${formatBytes(result.bytesReclaimed)}`);
        console.log(`  Duration:         ${result.durationMs}ms`);
      } finally {
        db.close();
      }
    });
}
