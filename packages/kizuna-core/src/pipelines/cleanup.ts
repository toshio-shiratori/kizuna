import type { Database } from "../storage/database.js";
import { sanitizeContent } from "./transcript-parser.js";
import { isLowQualityContent } from "./chunker.js";

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
      targets.push({
        id: row.id,
        content: row.content,
        role: row.role,
        sessionId: row.session_id,
        createdAt: row.created_at,
      });
    }
  }
  return targets;
}

export function cleanupChunks(db: Database, noisePatterns?: readonly string[]): CleanupResult {
  const start = performance.now();

  const targets = findLowQualityChunks(db, noisePatterns);
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
