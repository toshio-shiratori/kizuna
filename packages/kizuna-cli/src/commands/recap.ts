import type { Command } from "commander";
import { Database } from "@kizuna/core";
import { resolveDbPath, dbExists } from "../db-path.js";

export function registerRecap(program: Command): void {
  program
    .command("recap")
    .description("Show the latest session history for cross-team sharing")
    .option("--project <path>", "Target project directory (for cross-project sharing)")
    .option("-n, --limit <number>", "Maximum chunks to show (from the end of session)")
    .option("--cwd <path>", "Project directory", process.cwd())
    .action((opts: { project?: string; limit?: string; cwd: string }) => {
      const targetDir = opts.project ?? opts.cwd;

      if (!dbExists(targetDir)) {
        console.error(`No Kizuna database found at ${targetDir}. Run 'kizuna setup' first.`);
        process.exitCode = 1;
        return;
      }

      const db = new Database(resolveDbPath(targetDir));
      try {
        const session = db.getLatestSessionWithChunks();
        if (!session) {
          console.log("No sessions with chunks found.");
          return;
        }

        let chunks = db.getChunksBySession(session.id);

        if (opts.limit) {
          const limit = parseInt(opts.limit, 10);
          if (Number.isNaN(limit) || limit <= 0) {
            console.error("--limit must be a positive integer.");
            process.exitCode = 1;
            return;
          }
          if (chunks.length > limit) {
            chunks = chunks.slice(-limit);
          }
        }

        console.log(`## Session: ${session.startedAt} (project: ${session.projectId})\n`);

        for (const chunk of chunks) {
          console.log(`**${chunk.role}**: ${chunk.content}\n`);
        }
      } finally {
        db.close();
      }
    });
}
