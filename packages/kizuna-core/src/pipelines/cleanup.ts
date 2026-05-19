import type { Database } from "../storage/database.js";
import { sanitizeContent } from "./transcript-parser.js";
import { isLowQualityContent } from "./chunker.js";
import { preprocessQuery } from "./cjk-preprocessing.js";

export interface CleanupTarget {
  id: number;
  content: string;
  role: string;
  sessionId: string;
  createdAt: string;
}

export interface CleanupResult {
  chunksDeleted: number;
  sessionsDeleted: number;
  bytesReclaimed: number;
  durationMs: number;
}

interface AllChunkRow {
  id: number;
  content: string;
  role: string;
  session_id: string;
  created_at: string;
}

function toCleanupTarget(row: AllChunkRow): CleanupTarget {
  return {
    id: row.id,
    content: row.content,
    role: row.role,
    sessionId: row.session_id,
    createdAt: row.created_at,
  };
}

export function findLowQualityChunks(
  db: Database,
  noisePatterns?: readonly string[],
): CleanupTarget[] {
  const rows = db.db
    .prepare("SELECT id, content, role, session_id, created_at FROM chunks")
    .all() as AllChunkRow[];

  const targets: CleanupTarget[] = [];
  for (const row of rows) {
    const sanitized = sanitizeContent(row.content);
    if (sanitized.length === 0 || isLowQualityContent(sanitized, noisePatterns)) {
      targets.push(toCleanupTarget(row));
    }
  }
  return targets;
}

export function findChunksByQuery(db: Database, query: string): CleanupTarget[] {
  const { ftsQuery, likePatterns } = preprocessQuery(query);
  if (ftsQuery.length === 0 && likePatterns.length === 0) return [];

  try {
    if (ftsQuery.length === 0) {
      // LIKE-only mode
      const likeConditions = likePatterns.map(() => "c.content LIKE ? ESCAPE '\\'").join(" AND ");
      const sql = `SELECT c.id, c.content, c.role, c.session_id, c.created_at
         FROM chunks_fts
         JOIN chunks c ON chunks_fts.rowid = c.id
         WHERE ${likeConditions}`;
      const rows = db.db.prepare(sql).all(...likePatterns) as AllChunkRow[];
      return rows.map(toCleanupTarget);
    }

    // FTS5 MATCH mode (optionally combined with LIKE)
    const conditions: string[] = ["chunks_fts MATCH ?"];
    const params: string[] = [ftsQuery];
    for (const pattern of likePatterns) {
      conditions.push("c.content LIKE ? ESCAPE '\\'");
      params.push(pattern);
    }

    const sql = `SELECT c.id, c.content, c.role, c.session_id, c.created_at
         FROM chunks_fts
         JOIN chunks c ON chunks_fts.rowid = c.id
         WHERE ${conditions.join(" AND ")}`;
    const rows = db.db.prepare(sql).all(...params) as AllChunkRow[];
    return rows.map(toCleanupTarget);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`kizuna: FTS5 query failed: ${msg}`);
    return [];
  }
}

export function executeCleanup(db: Database, targets: CleanupTarget[]): CleanupResult {
  const start = performance.now();

  if (targets.length === 0) {
    return {
      chunksDeleted: 0,
      sessionsDeleted: 0,
      bytesReclaimed: 0,
      durationMs: Math.round(performance.now() - start),
    };
  }

  const sizeBefore = db.getDatabaseSizeBytes();
  const ids = targets.map((t) => t.id);
  const chunksDeleted = db.deleteChunks(ids);
  const sessionsDeleted = db.deleteEmptySessions();
  db.vacuum();
  const sizeAfter = db.getDatabaseSizeBytes();

  return {
    chunksDeleted,
    sessionsDeleted,
    bytesReclaimed: Math.max(0, sizeBefore - sizeAfter),
    durationMs: Math.round(performance.now() - start),
  };
}

export function cleanupChunks(db: Database, noisePatterns?: readonly string[]): CleanupResult {
  const targets = findLowQualityChunks(db, noisePatterns);
  return executeCleanup(db, targets);
}
