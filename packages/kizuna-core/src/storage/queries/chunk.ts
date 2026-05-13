import type BetterSqlite3 from "better-sqlite3";
import type { RawChunk, StoredChunk, SearchResult } from "../../index.js";
import type { ChunkRow, FtsRow } from "./types.js";
import { chunkRowToStoredChunk } from "./types.js";

export function insertChunk(
  db: BetterSqlite3.Database,
  chunk: RawChunk & { tokenCount?: number; importance?: number; createdAt?: string },
): StoredChunk {
  const now = chunk.createdAt ?? new Date().toISOString();
  const result = db
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

export function getChunk(db: BetterSqlite3.Database, id: number): StoredChunk | null {
  const row = db.prepare("SELECT * FROM chunks WHERE id = ?").get(id) as ChunkRow | undefined;
  return row ? chunkRowToStoredChunk(row) : null;
}

export function getChunksBySession(db: BetterSqlite3.Database, sessionId: string): StoredChunk[] {
  const rows = db
    .prepare("SELECT * FROM chunks WHERE session_id = ? ORDER BY turn_index")
    .all(sessionId) as ChunkRow[];
  return rows.map(chunkRowToStoredChunk);
}

export function deleteChunks(db: BetterSqlite3.Database, ids: number[]): number {
  if (ids.length === 0) return 0;
  const placeholders = ids.map(() => "?").join(",");
  const result = db.prepare(`DELETE FROM chunks WHERE id IN (${placeholders})`).run(...ids);
  return result.changes;
}

export function deleteChunksBefore(db: BetterSqlite3.Database, date: string): number {
  const result = db.prepare("DELETE FROM chunks WHERE created_at < ?").run(date);
  return result.changes;
}

export function searchChunks(
  db: BetterSqlite3.Database,
  query: string,
  limit: number = 10,
  halfLifeDays: number = 30,
): SearchResult[] {
  const rows = db
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
