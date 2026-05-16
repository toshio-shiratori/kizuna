import type { Command } from "commander";
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { Database, exportMemory } from "@kizuna/core";
import type { ExportFormat } from "@kizuna/core";
import { resolveDbPath, dbExists } from "../db-path.js";
import { createPositiveIntParser, createNonNegativeIntParser } from "../validators.js";
import { getProjectId } from "../hooks/shared.js";

function collectOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}

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
    .option("--output <path>", "Write output to file instead of stdout")
    .option("--clipboard", "Copy output to system clipboard")
    .option("--role <role>", "Filter by chunk role: user or assistant")
    .option(
      "--min-importance <n>",
      "Minimum importance threshold (0-10)",
      createNonNegativeIntParser("--min-importance", 10),
    )
    .option("--session <id>", "Filter by session ID (repeatable)", collectOption, [])
    .option("--no-metadata", "Omit chunk metadata from output")
    .option("--cwd <path>", "Project directory", process.cwd())
    .action(
      async (opts: {
        since?: string;
        until?: string;
        query?: string;
        format?: string;
        limit?: number;
        output?: string;
        clipboard?: boolean;
        role?: string;
        minImportance?: number;
        session: string[];
        metadata: boolean;
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

        // Validate role option
        const role = validateRole(opts.role);
        if (opts.role && !role) {
          console.error('Invalid role. Use "user" or "assistant".');
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
            role: role ?? undefined,
            minImportance: opts.minImportance,
            sessionIds: opts.session.length > 0 ? opts.session : undefined,
            noMetadata: !opts.metadata,
          });

          // Output destination
          if (opts.output) {
            writeFileSync(opts.output, output, "utf-8");
            console.error(`Exported to ${opts.output}`);
          } else if (opts.clipboard) {
            const success = copyToClipboard(output);
            if (success) {
              console.error("Copied to clipboard.");
            } else {
              console.error("Warning: clipboard copy failed. Falling back to stdout.");
              process.stdout.write(output);
            }
          } else {
            process.stdout.write(output);
          }
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

function validateRole(input?: string): "user" | "assistant" | null {
  if (!input) return null;
  if (input === "user") return "user";
  if (input === "assistant") return "assistant";
  return null;
}

function copyToClipboard(text: string): boolean {
  try {
    const command = process.platform === "darwin" ? "pbcopy" : "xclip -selection clipboard";
    execSync(command, { input: text, stdio: ["pipe", "ignore", "ignore"] });
    return true;
  } catch {
    return false;
  }
}
