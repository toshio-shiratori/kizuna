import type { Command } from "commander";
import { Database, loadConfig } from "@kizuna/core";
import { resolveDbPath, dbExists } from "../db-path.js";

export function registerRecap(program: Command): void {
  program
    .command("recap")
    .description("Show session history for cross-team sharing")
    .option("--project <path>", "Target project directory (for cross-project sharing)")
    .option("-n, --limit <number>", "Maximum chunks per session (from the end)")
    .option("--no-limit", "Show all chunks without limit")
    .option("-s, --sessions <number>", "Number of recent sessions to show", "1")
    .option("--session <id>", "Show a specific session by ID (supports prefix match)")
    .option("--date <date>", "Filter sessions by date (YYYY-MM-DD)")
    .option("--last <n>", "Show the Nth most recent session")
    .option("-l, --list", "List sessions with chunk previews")
    .option("--cwd <path>", "Project directory", process.cwd())
    .action(
      (opts: {
        project?: string;
        limit: string | boolean;
        sessions: string;
        session?: string;
        date?: string;
        last?: string;
        list?: boolean;
        cwd: string;
      }) => {
        const targetDir = opts.project ?? opts.cwd;

        if (!dbExists(targetDir)) {
          console.error(`No Kizuna database found at ${targetDir}. Run 'kizuna setup' first.`);
          process.exitCode = 1;
          return;
        }

        const config = loadConfig(targetDir);
        const chunkLimit = resolveLimit(opts.limit, config.display.recapChunkLimit);
        const db = new Database(resolveDbPath(targetDir));
        try {
          if (opts.list) {
            showSessionList(db);
          } else if (opts.date) {
            showSessionsByDate(db, opts.date, chunkLimit);
          } else if (opts.last) {
            showLastNthSession(db, opts.last, chunkLimit);
          } else if (opts.session) {
            showSpecificSession(db, opts.session, chunkLimit);
          } else {
            const count = parseInt(opts.sessions, 10);
            if (Number.isNaN(count) || count <= 0) {
              console.error("--sessions must be a positive integer.");
              process.exitCode = 1;
              return;
            }
            showLatestSessions(db, count, chunkLimit);
          }
        } finally {
          db.close();
        }
      },
    );
}

function isValidDate(dateStr: string): boolean {
  const [y, m, d] = dateStr.split("-").map(Number) as [number, number, number];
  const parsed = new Date(y, m - 1, d);
  return parsed.getFullYear() === y && parsed.getMonth() === m - 1 && parsed.getDate() === d;
}

function resolveLimit(limitOpt: string | boolean, defaultLimit: number): number | null {
  if (limitOpt === false) return null;
  if (limitOpt === true) return defaultLimit;
  const limit = parseInt(limitOpt as string, 10);
  if (Number.isNaN(limit) || limit <= 0) return defaultLimit;
  return limit;
}

function showSessionList(db: Database): void {
  const previews = db.listSessionsWithPreview();
  if (previews.length === 0) {
    console.log("No sessions with chunks found.");
    return;
  }

  console.log("Sessions with chunks:");
  for (const p of previews) {
    const dt = p.startedAt.replace("T", " ").slice(0, 16);
    const proj = p.projectId.padEnd(12);
    console.log(`  ${dt}  ${proj}${p.preview}`);
  }
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
  // Try exact match first
  const session = db.getSession(sessionId);
  if (session) {
    const chunks = db.getChunksBySession(sessionId);
    if (chunks.length === 0) {
      console.log(`Session ${sessionId} has no chunks.`);
      return;
    }
    printSession(db, session.id, session.startedAt, session.projectId, limit);
    return;
  }

  // Fall back to prefix match
  const candidates = db.getSessionsByIdPrefix(sessionId);
  if (candidates.length === 0) {
    console.error(`Session not found: ${sessionId}`);
    process.exitCode = 1;
    return;
  }

  if (candidates.length === 1) {
    const matched = candidates[0]!;
    const chunks = db.getChunksBySession(matched.id);
    if (chunks.length === 0) {
      console.log(`Session ${matched.id} has no chunks.`);
      return;
    }
    printSession(db, matched.id, matched.startedAt, matched.projectId, limit);
    return;
  }

  // Multiple candidates: show list
  console.log(`Multiple sessions match prefix "${sessionId}":`);
  for (const c of candidates) {
    const dt = c.startedAt.replace("T", " ").slice(0, 16);
    console.log(`  ${c.id}  ${dt}  ${c.projectId}`);
  }
  console.log("\nSpecify a longer prefix to narrow down.");
}

function showSessionsByDate(db: Database, date: string, limit: number | null): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !isValidDate(date)) {
    console.error("Invalid date format. Use YYYY-MM-DD.");
    process.exitCode = 1;
    return;
  }

  const sessions = db.getSessionsByDate(date);
  if (sessions.length === 0) {
    console.log(`No sessions with chunks found for ${date}.`);
    return;
  }

  if (sessions.length === 1) {
    const session = sessions[0]!;
    printSession(db, session.id, session.startedAt, session.projectId, limit);
    return;
  }

  // Multiple sessions: show list
  console.log(`Sessions on ${date}:`);
  for (const s of sessions) {
    const dt = s.startedAt.replace("T", " ").slice(0, 16);
    const chunks = db.getChunksBySession(s.id);
    console.log(`  ${s.id}  ${dt}  ${s.projectId}  (${chunks.length} chunks)`);
  }
}

function showLastNthSession(db: Database, nStr: string, limit: number | null): void {
  const n = parseInt(nStr, 10);
  if (Number.isNaN(n) || n <= 0) {
    console.error("--last must be a positive integer.");
    process.exitCode = 1;
    return;
  }

  const sessions = db.getLatestSessionsWithChunks(n);
  if (sessions.length < n) {
    console.error(`Only ${sessions.length} session(s) with chunks available.`);
    process.exitCode = 1;
    return;
  }

  const session = sessions[n - 1]!;
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
