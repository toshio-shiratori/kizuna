import type { Command } from "commander";
import { Database } from "@kizuna/core";
import { resolveDbPath, dbExists } from "../db-path.js";

const DEFAULT_CHUNK_LIMIT = 5;

export function registerRecap(program: Command): void {
  program
    .command("recap")
    .description("Show session history for cross-team sharing")
    .option("--project <path>", "Target project directory (for cross-project sharing)")
    .option("-n, --limit <number>", "Maximum chunks per session (from the end)", "5")
    .option("--no-limit", "Show all chunks without limit")
    .option("-s, --sessions <number>", "Number of recent sessions to show", "1")
    .option("--session <id>", "Show a specific session by ID")
    .option("--cwd <path>", "Project directory", process.cwd())
    .action(
      (opts: {
        project?: string;
        limit: string | boolean;
        sessions: string;
        session?: string;
        cwd: string;
      }) => {
        const targetDir = opts.project ?? opts.cwd;

        if (!dbExists(targetDir)) {
          console.error(`No Kizuna database found at ${targetDir}. Run 'kizuna setup' first.`);
          process.exitCode = 1;
          return;
        }

        const db = new Database(resolveDbPath(targetDir));
        try {
          if (opts.session) {
            showSpecificSession(db, opts.session, resolveLimit(opts.limit));
          } else {
            const count = parseInt(opts.sessions, 10);
            if (Number.isNaN(count) || count <= 0) {
              console.error("--sessions must be a positive integer.");
              process.exitCode = 1;
              return;
            }
            showLatestSessions(db, count, resolveLimit(opts.limit));
          }
        } finally {
          db.close();
        }
      },
    );
}

function resolveLimit(limitOpt: string | boolean): number | null {
  if (limitOpt === false) return null;
  const limit = parseInt(limitOpt as string, 10);
  if (Number.isNaN(limit) || limit <= 0) return DEFAULT_CHUNK_LIMIT;
  return limit;
}

function showLatestSessions(db: Database, count: number, limit: number | null): void {
  const sessions = db.getLatestSessionsWithChunks(count);
  if (sessions.length === 0) {
    console.log("No sessions with chunks found.");
    return;
  }

  for (const session of sessions) {
    printSession(db, session.id, session.startedAt, session.projectId, limit);
  }
}

function showSpecificSession(db: Database, sessionId: string, limit: number | null): void {
  const session = db.getSession(sessionId);
  if (!session) {
    console.error(`Session not found: ${sessionId}`);
    process.exitCode = 1;
    return;
  }

  const chunks = db.getChunksBySession(sessionId);
  if (chunks.length === 0) {
    console.log(`Session ${sessionId} has no chunks.`);
    return;
  }

  printSession(db, session.id, session.startedAt, session.projectId, limit);
}

function printSession(
  db: Database,
  sessionId: string,
  startedAt: string,
  projectId: string,
  limit: number | null,
): void {
  let chunks = db.getChunksBySession(sessionId);

  if (limit !== null && chunks.length > limit) {
    chunks = chunks.slice(-limit);
  }

  console.log(`## Session: ${startedAt} (project: ${projectId})\n`);

  for (const chunk of chunks) {
    console.log(`**${chunk.role}**: ${chunk.content}\n`);
  }
}
