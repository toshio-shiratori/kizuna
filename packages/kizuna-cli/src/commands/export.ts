import type { Command } from "commander";
import { Database, exportMemory } from "@kizuna/core";
import type { ExportFormat } from "@kizuna/core";
import { resolveDbPath, dbExists } from "../db-path.js";
import { createPositiveIntParser } from "../validators.js";
import { getProjectId } from "../hooks/shared.js";

export function registerExport(program: Command): void {
  program
    .command("export")
    .description("Export memory chunks in structured format")
    .option("--since <date>", "Start of time range (ISO 8601 or relative: 7d, 1w, 1m)")
    .option("--until <date>", "End of time range (ISO 8601 or relative: 7d, 1w, 1m)")
    .option("--query <text>", "FTS5 search filter")
    .option("--format <format>", "Output format: markdown or json (default: markdown)")
    .option(
      "-n, --limit <number>",
      "Maximum chunks to export (1-10000)",
      createPositiveIntParser("--limit", 10000),
    )
    .option("--cwd <path>", "Project directory", process.cwd())
    .action(
      async (opts: {
        since?: string;
        until?: string;
        query?: string;
        format?: string;
        limit?: number;
        cwd: string;
      }) => {
        if (!dbExists(opts.cwd)) {
          console.error("No Kizuna database found. Run 'kizuna setup' first.");
          process.exitCode = 1;
          return;
        }

        // Validate format option
        const format = validateFormat(opts.format);
        if (!format) {
          console.error('Invalid format. Use "markdown" or "json".');
          process.exitCode = 1;
          return;
        }

        const db = new Database(resolveDbPath(opts.cwd));
        try {
          const output = await exportMemory(db, {
            since: opts.since,
            until: opts.until,
            query: opts.query,
            format,
            limit: opts.limit ?? 100,
            projectId: getProjectId(opts.cwd),
          });

          process.stdout.write(output);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Export failed: ${message}`);
          process.exitCode = 1;
        } finally {
          db.close();
        }
      },
    );
}

function validateFormat(input?: string): ExportFormat | null {
  if (!input || input === "markdown") return "markdown";
  if (input === "json") return "json";
  return null;
}
