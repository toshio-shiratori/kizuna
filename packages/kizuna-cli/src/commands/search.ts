import type { Command } from "commander";
import { Database, searchMemory, loadConfig } from "@kizuna/core";
import { resolveDbPath, dbExists } from "../db-path.js";
import { createPositiveIntParser } from "../validators.js";

export function registerSearch(program: Command): void {
  program
    .command("search <query>")
    .description("Search stored memories")
    .option(
      "-n, --limit <number>",
      "Maximum results (1-1000)",
      createPositiveIntParser("--limit", 1000),
    )
    .option("--cwd <path>", "Project directory", process.cwd())
    .action(async (query: string, opts: { limit?: number; cwd: string }) => {
      if (!dbExists(opts.cwd)) {
        console.error("No Kizuna database found. Run 'kizuna setup' first.");
        process.exitCode = 1;
        return;
      }

      const config = loadConfig(opts.cwd);
      const db = new Database(resolveDbPath(opts.cwd));
      try {
        const limit = opts.limit ?? config.pipeline.maxResults;
        const results = await searchMemory(
          db,
          { text: query, limit },
          { normalizeByLength: config.pipeline.normalizeScoreByLength },
        );

        if (results.length === 0) {
          console.log("No results found.");
          return;
        }

        const { previewLength } = config.display;
        for (const result of results) {
          const { chunk, score } = result;
          const date = chunk.createdAt.split("T")[0];
          console.log(`[${chunk.id}] ${date} (${chunk.role}) score=${score.toFixed(3)}`);
          console.log(`  ${chunk.content.slice(0, previewLength).replace(/\n/g, " ")}`);
          console.log("");
        }

        console.log(`${results.length} result(s) found.`);
      } finally {
        db.close();
      }
    });
}
