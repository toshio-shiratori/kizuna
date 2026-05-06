import type { Command } from "commander";
import { Database, searchMemory } from "@kizuna/core";
import { resolveDbPath, dbExists } from "../db-path.js";

export function registerSearch(program: Command): void {
  program
    .command("search <query>")
    .description("Search stored memories")
    .option("-n, --limit <number>", "Maximum results", "10")
    .option("--cwd <path>", "Project directory", process.cwd())
    .action((query: string, opts: { limit: string; cwd: string }) => {
      if (!dbExists(opts.cwd)) {
        console.error("No Kizuna database found. Run 'kizuna setup' first.");
        process.exitCode = 1;
        return;
      }

      const db = new Database(resolveDbPath(opts.cwd));
      try {
        const results = searchMemory(db, {
          text: query,
          limit: parseInt(opts.limit, 10),
        });

        if (results.length === 0) {
          console.log("No results found.");
          return;
        }

        for (const result of results) {
          const { chunk, score } = result;
          const date = chunk.createdAt.split("T")[0];
          console.log(`[${chunk.id}] ${date} (${chunk.role}) score=${score.toFixed(3)}`);
          console.log(`  ${chunk.content.slice(0, 120).replace(/\n/g, " ")}`);
          console.log("");
        }

        console.log(`${results.length} result(s) found.`);
      } finally {
        db.close();
      }
    });
}
