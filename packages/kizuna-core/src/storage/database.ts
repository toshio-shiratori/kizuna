import BetterSqlite3 from "better-sqlite3";
import type {
  Session,
  RawChunk,
  StoredChunk,
  SearchResult,
  MaintenanceResult,
  SessionPreview,
} from "../index.js";
import { runCoreMigrations } from "./migrator.js";

interface ChunkRow {
  id: number;
  session_id: string;
  turn_index: number;
  role: "user" | "assistant";
  content: string;
  token_count: number;
  importance: number;
  created_at: string;
  metadata: string;
}

interface SessionRow {
  id: string;
  project_id: string;
  started_at: string;
  ended_at: string | null;
  transcript_path: string | null;
  metadata: string;
}

interface MaintenanceRow {
  id: number;
  ran_at: string;
  chunks_deleted: number;
  sessions_deleted: number;
  bytes_reclaimed: number;
  duration_ms: number;
}

interface SessionPreviewRow {
  session_id: string;
  started_at: string;
  project_id: string;
  preview: string;
}

interface FtsRow extends ChunkRow {
  bm25_score: number;
  time_decay: number;
}

function chunkRowToStoredChunk(row: ChunkRow): StoredChunk {
  return {
    id: row.id,
    sessionId: row.session_id,
    turnIndex: row.turn_index,
    role: row.role,
    content: row.content,
    tokenCount: row.token_count,
    importance: row.importance,
    createdAt: row.created_at,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
  };
}

function sessionRowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    projectId: row.project_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    transcriptPath: row.transcript_path,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
  };
}

export class Database {
  readonly db: BetterSqlite3.Database;

  constructor(dbPath: string) {
    this.db = new BetterSqlite3(dbPath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = NORMAL");
    this.db.pragma("busy_timeout = 5000");
    this.db.pragma("foreign_keys = ON");
    runCoreMigrations(this.db);
  }

  close(): void {
    this.db.close();
  }

  beginTransaction(): void {
    this.db.exec("BEGIN");
  }

  commit(): void {
    this.db.exec("COMMIT");
  }

  rollback(): void {
    this.db.exec("ROLLBACK");
  }

  // ─── Sessions ─────────────────────────────────────────

  insertSession(session: Session): void {
    this.db
      .prepare(
        `INSERT INTO sessions (id, project_id, started_at, ended_at, transcript_path, metadata)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        session.id,
        session.projectId,
        session.startedAt,
        session.endedAt,
        session.transcriptPath,
        JSON.stringify(session.metadata),
      );
  }

  getSession(id: string): Session | null {
    const row = this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as
      | SessionRow
      | undefined;
    return row ? sessionRowToSession(row) : null;
  }

  upsertSession(session: Session): void {
    this.db
      .prepare(
        `INSERT INTO sessions (id, project_id, started_at, ended_at, transcript_path, metadata)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           ended_at = excluded.ended_at,
           transcript_path = excluded.transcript_path,
           metadata = excluded.metadata`,
      )
      .run(
        session.id,
        session.projectId,
        session.startedAt,
        session.endedAt,
        session.transcriptPath,
        JSON.stringify(session.metadata),
      );
  }

  getLatestSession(): Session | null {
    const row = this.db.prepare("SELECT * FROM sessions ORDER BY started_at DESC LIMIT 1").get() as
      | SessionRow
      | undefined;
    return row ? sessionRowToSession(row) : null;
  }

  getLatestSessionWithChunks(): Session | null {
    const row = this.db
      .prepare(
        `SELECT s.* FROM sessions s
         WHERE EXISTS (SELECT 1 FROM chunks c WHERE c.session_id = s.id)
         ORDER BY s.started_at DESC LIMIT 1`,
      )
      .get() as SessionRow | undefined;
    return row ? sessionRowToSession(row) : null;
  }

  getLatestSessionsWithChunks(count: number): Session[] {
    const rows = this.db
      .prepare(
        `SELECT s.* FROM sessions s
         WHERE EXISTS (SELECT 1 FROM chunks c WHERE c.session_id = s.id)
         ORDER BY s.started_at DESC LIMIT ?`,
      )
      .all(count) as SessionRow[];
    return rows.map(sessionRowToSession);
  }

  listSessionsWithPreview(limit: number = 10): SessionPreview[] {
    const rows = this.db
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

  getMaxTurnIndex(sessionId: string): number | null {
    const row = this.db
      .prepare("SELECT MAX(turn_index) AS max_turn FROM chunks WHERE session_id = ?")
      .get(sessionId) as { max_turn: number | null };
    return row.max_turn;
  }

  // ─── Chunks ───────────────────────────────────────────

  insertChunk(
    chunk: RawChunk & { tokenCount?: number; importance?: number; createdAt?: string },
  ): StoredChunk {
    const now = chunk.createdAt ?? new Date().toISOString();
    const result = this.db
      .prepare(
        `INSERT INTO chunks (session_id, turn_index, role, content, token_count, importance, created_at, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        chunk.sessionId,
        chunk.turnIndex,
        chunk.role,
        chunk.content,
        chunk.tokenCount ?? 0,
        chunk.importance ?? 5,
        now,
        JSON.stringify(chunk.metadata),
      );

    return {
      id: Number(result.lastInsertRowid),
      sessionId: chunk.sessionId,
      turnIndex: chunk.turnIndex,
      role: chunk.role,
      content: chunk.content,
      tokenCount: chunk.tokenCount ?? 0,
      importance: chunk.importance ?? 5,
      createdAt: now,
      metadata: chunk.metadata,
    };
  }

  getChunk(id: number): StoredChunk | null {
    const row = this.db.prepare("SELECT * FROM chunks WHERE id = ?").get(id) as
      | ChunkRow
      | undefined;
    return row ? chunkRowToStoredChunk(row) : null;
  }

  getChunksBySession(sessionId: string): StoredChunk[] {
    const rows = this.db
      .prepare("SELECT * FROM chunks WHERE session_id = ? ORDER BY turn_index")
      .all(sessionId) as ChunkRow[];
    return rows.map(chunkRowToStoredChunk);
  }

  deleteChunks(ids: number[]): number {
    if (ids.length === 0) return 0;
    const placeholders = ids.map(() => "?").join(",");
    const result = this.db.prepare(`DELETE FROM chunks WHERE id IN (${placeholders})`).run(...ids);
    return result.changes;
  }

  deleteChunksBefore(date: string): number {
    const result = this.db.prepare("DELETE FROM chunks WHERE created_at < ?").run(date);
    return result.changes;
  }

  // ─── Search ───────────────────────────────────────────

  searchChunks(query: string, limit: number = 10, halfLifeDays: number = 30): SearchResult[] {
    const rows = this.db
      .prepare(
        `SELECT
           c.*,
           bm25(chunks_fts) AS bm25_score,
           exp(-0.693 * (julianday('now') - julianday(c.created_at)) / ?) AS time_decay
         FROM chunks_fts
         JOIN chunks c ON chunks_fts.rowid = c.id
         WHERE chunks_fts MATCH ?
         ORDER BY (bm25(chunks_fts) * exp(-0.693 * (julianday('now') - julianday(c.created_at)) / ?) * (1.0 + c.importance / 10.0)) DESC
         LIMIT ?`,
      )
      .all(halfLifeDays, query, halfLifeDays, limit) as FtsRow[];

    return rows.map((row) => ({
      chunk: chunkRowToStoredChunk(row),
      score: Math.abs(row.bm25_score) * row.time_decay * (1.0 + row.importance / 10.0),
    }));
  }

  // ─── Maintenance ──────────────────────────────────────

  insertMaintenanceRun(result: MaintenanceResult, ranAt?: string): void {
    this.db
      .prepare(
        `INSERT INTO maintenance_runs (ran_at, chunks_deleted, sessions_deleted, bytes_reclaimed, duration_ms)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        ranAt ?? new Date().toISOString(),
        result.chunksDeleted,
        result.sessionsDeleted,
        result.bytesReclaimed,
        result.durationMs,
      );
  }

  getLastMaintenanceRun(): MaintenanceRow | null {
    return (
      (this.db.prepare("SELECT * FROM maintenance_runs ORDER BY ran_at DESC LIMIT 1").get() as
        | MaintenanceRow
        | undefined) ?? null
    );
  }

  deleteEmptySessions(): number {
    const result = this.db
      .prepare("DELETE FROM sessions WHERE id NOT IN (SELECT DISTINCT session_id FROM chunks)")
      .run();
    return result.changes;
  }

  deleteOldestChunksPercent(percent: number): number {
    const result = this.db
      .prepare(
        `DELETE FROM chunks WHERE id IN (
           SELECT id FROM chunks ORDER BY created_at ASC
           LIMIT (SELECT MAX(1, COUNT(*) * ? / 100) FROM chunks)
         )`,
      )
      .run(percent);
    return result.changes;
  }

  getDatabaseSizeBytes(): number {
    const row = this.db
      .prepare(
        "SELECT (page_count - freelist_count) * page_size AS size FROM pragma_page_count(), pragma_page_size(), pragma_freelist_count()",
      )
      .get() as { size: number };
    return row.size;
  }

  walCheckpoint(): void {
    this.db.pragma("wal_checkpoint(TRUNCATE)");
  }

  vacuum(): void {
    this.db.exec("VACUUM");
  }
}
