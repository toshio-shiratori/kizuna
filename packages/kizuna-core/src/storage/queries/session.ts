import type BetterSqlite3 from "better-sqlite3";
import type { Session, SessionPreview } from "../../index.js";
import type { SessionRow, SessionPreviewRow } from "./types.js";
import { sessionRowToSession } from "./types.js";

export function insertSession(db: BetterSqlite3.Database, session: Session): void {
  db.prepare(
    `INSERT INTO sessions (id, project_id, started_at, ended_at, transcript_path, metadata)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    session.id,
    session.projectId,
    session.startedAt,
    session.endedAt,
    session.transcriptPath,
    JSON.stringify(session.metadata),
  );
}

export function getSession(db: BetterSqlite3.Database, id: string): Session | null {
  const row = db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
  return row ? sessionRowToSession(row) : null;
}

export function upsertSession(db: BetterSqlite3.Database, session: Session): void {
  db.prepare(
    `INSERT INTO sessions (id, project_id, started_at, ended_at, transcript_path, metadata)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       ended_at = excluded.ended_at,
       transcript_path = excluded.transcript_path,
       metadata = excluded.metadata`,
  ).run(
    session.id,
    session.projectId,
    session.startedAt,
    session.endedAt,
    session.transcriptPath,
    JSON.stringify(session.metadata),
  );
}

export function getLatestSession(db: BetterSqlite3.Database): Session | null {
  const row = db.prepare("SELECT * FROM sessions ORDER BY started_at DESC LIMIT 1").get() as
    | SessionRow
    | undefined;
  return row ? sessionRowToSession(row) : null;
}

export function getLatestSessionWithChunks(db: BetterSqlite3.Database): Session | null {
  const row = db
    .prepare(
      `SELECT s.* FROM sessions s
       WHERE EXISTS (SELECT 1 FROM chunks c WHERE c.session_id = s.id)
       ORDER BY s.started_at DESC LIMIT 1`,
    )
    .get() as SessionRow | undefined;
  return row ? sessionRowToSession(row) : null;
}

export function getLatestSessionsWithChunks(db: BetterSqlite3.Database, count: number): Session[] {
  const rows = db
    .prepare(
      `SELECT s.* FROM sessions s
       WHERE EXISTS (SELECT 1 FROM chunks c WHERE c.session_id = s.id)
       ORDER BY s.started_at DESC LIMIT ?`,
    )
    .all(count) as SessionRow[];
  return rows.map(sessionRowToSession);
}

export function listSessionsWithPreview(
  db: BetterSqlite3.Database,
  limit: number = 10,
): SessionPreview[] {
  const rows = db
    .prepare(
      `SELECT s.id AS session_id, s.started_at, s.project_id, c.content AS preview
       FROM sessions s
       JOIN chunks c ON c.id = (
         SELECT c2.id FROM chunks c2
         WHERE c2.session_id = s.id
         ORDER BY c2.created_at ASC, c2.turn_index ASC
         LIMIT 1
       )
       ORDER BY s.started_at DESC
       LIMIT ?`,
    )
    .all(limit) as SessionPreviewRow[];

  return rows.map((row) => ({
    sessionId: row.session_id,
    startedAt: row.started_at,
    projectId: row.project_id,
    preview: row.preview.split("\n")[0]!,
  }));
}

export function getSessionsByDate(db: BetterSqlite3.Database, date: string): Session[] {
  const rows = db
    .prepare(
      `SELECT s.* FROM sessions s
       WHERE s.started_at LIKE ? || '%'
       AND EXISTS (SELECT 1 FROM chunks c WHERE c.session_id = s.id)
       ORDER BY s.started_at DESC`,
    )
    .all(date) as SessionRow[];
  return rows.map(sessionRowToSession);
}

export function getSessionsByIdPrefix(db: BetterSqlite3.Database, prefix: string): Session[] {
  const escaped = prefix.replace(/[%_]/g, "\\$&");
  const rows = db
    .prepare(`SELECT * FROM sessions WHERE id LIKE ? || '%' ESCAPE '\\' ORDER BY started_at DESC`)
    .all(escaped) as SessionRow[];
  return rows.map(sessionRowToSession);
}

export function getMaxTurnIndex(db: BetterSqlite3.Database, sessionId: string): number | null {
  const row = db
    .prepare("SELECT MAX(turn_index) AS max_turn FROM chunks WHERE session_id = ?")
    .get(sessionId) as { max_turn: number | null };
  return row.max_turn;
}
