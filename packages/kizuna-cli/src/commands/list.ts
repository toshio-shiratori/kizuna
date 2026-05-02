import type { Command } from "commander";
import { Database } from "@kizuna/core";
import { resolveDbPath, dbExists } from "../db-path.js";

export function registerList(program: Command): void {
  program
    .command("list")
    .description("List stored memory chunks")
    .option("--session <id>", "Filter by session ID")
    .option("-n, --limit <number>", "Maximum results", "20")
    .option("--cwd <path>", "Project directory", process.cwd())
    .action(
      (opts: { session?: string; limit: string; cwd: string }) => {
        if (!dbExists(opts.cwd)) {
          console.error(
            "No Kizuna database found. Run 'kizuna setup' first.",
          );
          process.exitCode = 1;
          return;
        }

        const db = new Database(resolveDbPath(opts.cwd));
        try {
          if (opts.session) {
            const chunks = db.getChunksBySession(opts.session);
            if (chunks.length === 0) {
              console.log(`No chunks found for session: ${opts.session}`);
              return;
            }
            for (const chunk of chunks) {
              const date = chunk.createdAt.split("T")[0];
              console.log(
                `[${chunk.id}] turn=${chunk.turnIndex} ${date} (${chunk.role})`,
              );
              console.log(
                `  ${chunk.content.slice(0, 120).replace(/\n/g, " ")}`,
              );
              console.log("");
            }
            console.log(`${chunks.length} chunk(s) in session.`);
          } else {
            const limit = parseInt(opts.limit, 10);
            const rows = db.db
              .prepare(
                `SELECT * FROM chunks ORDER BY created_at DESC LIMIT ?`,
              )
              .all(limit) as Array<{
              id: number;
              session_id: string;
              turn_index: number;
              role: string;
              content: string;
              token_count: number;
              importance: number;
              created_at: string;
              metadata: string;
            }>;

            if (rows.length === 0) {
              console.log("No chunks stored.");
              return;
            }

            for (const row of rows) {
              const date = row.created_at.split("T")[0];
              console.log(
                `[${row.id}] ${date} (${row.role}) session=${row.session_id.slice(0, 8)}...`,
              );
              console.log(
                `  ${row.content.slice(0, 120).replace(/\n/g, " ")}`,
              );
              console.log("");
            }
            console.log(`${rows.length} chunk(s) shown.`);
          }
        } finally {
          db.close();
        }
      },
    );
}
