import { createInterface } from "node:readline";
import { pathToFileURL } from "node:url";
import type { Command } from "commander";
import { Database, readPluginsConfig, estimateTokens } from "@kizuna/core";
import { resolveDbPath, dbExists } from "../db-path.js";
import { findPluginByKey, resolvePluginDistPath } from "./plugin/registry.js";

interface RedactionPattern {
  readonly name: string;
  readonly regex: RegExp;
}

interface ChunkRow {
  id: number;
  content: string;
  metadata: string;
}

interface SanitizeOptions {
  dryRun?: boolean;
  session?: string;
  yes?: boolean;
  cwd: string;
}

interface PatternMatchSummary {
  name: string;
  count: number;
}

function confirmPrompt(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(message, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}

function countPerPattern(
  content: string,
  patterns: readonly RedactionPattern[],
): PatternMatchSummary[] {
  const results: PatternMatchSummary[] = [];
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    const matches = content.match(regex);
    if (matches) {
      results.push({ name: pattern.name, count: matches.length });
    }
  }
  return results;
}

export function registerSanitize(program: Command): void {
  program
    .command("sanitize")
    .description("Retroactively sanitize existing chunks using pii-sanitizer plugin patterns")
    .option("--dry-run", "Show what would be sanitized without actually modifying data")
    .option("--session <id>", "Only sanitize chunks in a specific session")
    .option("--yes", "Skip confirmation prompt")
    .option("--cwd <path>", "Project directory", process.cwd())
    .action(async (opts: SanitizeOptions) => {
      if (!dbExists(opts.cwd)) {
        console.error("No Kizuna database found. Run 'kizuna setup' first.");
        process.exitCode = 1;
        return;
      }

      // 1. Check pii-sanitizer is enabled
      const pluginsConfig = readPluginsConfig(opts.cwd);
      if (!pluginsConfig) {
        console.error(
          'pii-sanitizer is not enabled. Run "kizuna plugin enable pii-sanitizer" first.',
        );
        process.exitCode = 1;
        return;
      }

      let pluginEntry: { enabled: boolean; options?: Record<string, unknown> } | undefined;
      for (const key of Object.keys(pluginsConfig.plugins)) {
        const def = findPluginByKey(key);
        if (def?.shortName === "pii-sanitizer") {
          pluginEntry = pluginsConfig.plugins[key];
          break;
        }
      }

      if (!pluginEntry?.enabled) {
        console.error(
          'pii-sanitizer is not enabled. Run "kizuna plugin enable pii-sanitizer" first.',
        );
        process.exitCode = 1;
        return;
      }

      // 2. Load plugin functions dynamically
      const piiDef = findPluginByKey("@kizuna/plugin-pii-sanitizer");
      /* c8 ignore next 5 -- defensive: registry always has pii-sanitizer */
      if (!piiDef) {
        console.error("pii-sanitizer plugin not found in registry.");
        process.exitCode = 1;
        return;
      }

      const distPath = resolvePluginDistPath(piiDef);
      let mod: {
        redactContent: (
          content: string,
          patterns: readonly RedactionPattern[],
        ) => { content: string; redactedCount: number; redactedTypes: string[] };
        compilePatterns: (
          customPatterns?: ReadonlyArray<{ name: string; pattern: string; flags?: string }>,
        ) => RedactionPattern[];
      };
      try {
        mod = (await import(pathToFileURL(distPath).href)) as typeof mod;
      } catch {
        console.error(
          `Failed to load pii-sanitizer plugin from "${distPath}". Run "pnpm build" first.`,
        );
        process.exitCode = 1;
        return;
      }
      const { redactContent, compilePatterns } = mod;

      // 3. Compile patterns (including custom patterns from config)
      const customPatterns = pluginEntry.options?.customPatterns as
        | ReadonlyArray<{ name: string; pattern: string; flags?: string }>
        | undefined;
      const patterns = compilePatterns(customPatterns);

      // 4. Query chunks
      const db = new Database(resolveDbPath(opts.cwd));
      try {
        const query = opts.session
          ? "SELECT id, content, metadata FROM chunks WHERE session_id = ?"
          : "SELECT id, content, metadata FROM chunks";
        const rows = (
          opts.session ? db.db.prepare(query).all(opts.session) : db.db.prepare(query).all()
        ) as ChunkRow[];

        // 5. Scan for matches
        const matchingChunks: Array<{
          row: ChunkRow;
          redacted: { content: string; redactedCount: number; redactedTypes: string[] };
        }> = [];

        const aggregatedPatternCounts = new Map<string, number>();
        let totalRedactions = 0;

        for (const row of rows) {
          const result = redactContent(row.content, patterns);
          if (result.redactedCount > 0) {
            const perPattern = countPerPattern(row.content, patterns);
            matchingChunks.push({ row, redacted: result });
            totalRedactions += result.redactedCount;

            for (const ps of perPattern) {
              aggregatedPatternCounts.set(
                ps.name,
                (aggregatedPatternCounts.get(ps.name) ?? 0) + ps.count,
              );
            }
          }
        }

        if (matchingChunks.length === 0) {
          console.log("No chunks require sanitization. All data is clean.");
          return;
        }

        console.log(`Found ${matchingChunks.length} chunks with ${totalRedactions} PII matches:`);
        for (const [name, count] of aggregatedPatternCounts) {
          console.log(`  ${name}: ${count}`);
        }

        if (opts.dryRun) {
          console.log("");
          console.log("Run without --dry-run to apply sanitization.");
          return;
        }

        // 6. Confirm
        if (!opts.yes) {
          if (!process.stdin.isTTY) {
            console.error("");
            console.error("Use --yes to confirm sanitization in non-interactive mode.");
            process.exitCode = 1;
            return;
          }

          const confirmed = await confirmPrompt(
            `\nSanitize ${matchingChunks.length} chunks? [y/N] `,
          );
          if (!confirmed) {
            console.log("Aborted.");
            return;
          }
        }

        // 7. Apply sanitization in a transaction
        const updateStmt = db.db.prepare(
          "UPDATE chunks SET content = ?, metadata = ?, token_count = ? WHERE id = ?",
        );

        db.beginTransaction();
        try {
          for (const { row, redacted } of matchingChunks) {
            const existingMeta = JSON.parse(row.metadata || "{}") as Record<string, unknown>;
            const newMeta = {
              ...existingMeta,
              "@kizuna/plugin-pii-sanitizer": {
                redactedCount: redacted.redactedCount,
                redactedTypes: redacted.redactedTypes,
              },
            };
            const newTokenCount = estimateTokens(redacted.content);
            updateStmt.run(redacted.content, JSON.stringify(newMeta), newTokenCount, row.id);
          }
          db.commit();
        } catch (err) {
          db.rollback();
          throw err;
        }

        // 8. Summary
        console.log("");
        console.log("Sanitization completed:");
        console.log(`  Chunks updated:    ${matchingChunks.length}`);
        console.log(`  Total redactions:  ${totalRedactions}`);
      } finally {
        db.close();
      }
    });
}
