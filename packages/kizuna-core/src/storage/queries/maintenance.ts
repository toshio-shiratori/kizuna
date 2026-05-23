import type BetterSqlite3 from "better-sqlite3";
import type { MaintenanceResult, MaintenanceRun } from "../../index.js";
import type { MaintenanceRow } from "./types.js";
import { maintenanceRowToRun } from "./types.js";

export function insertMaintenanceRun(
  db: BetterSqlite3.Database,
  result: MaintenanceResult,
  ranAt?: string,
): void {
  db.prepare(
    `INSERT INTO maintenance_runs (ran_at, chunks_deleted, sessions_deleted, bytes_reclaimed, duration_ms)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    ranAt ?? new Date().toISOString(),
    result.chunksDeleted,
    result.sessionsDeleted,
    result.bytesReclaimed,
    result.durationMs,
  );
}

export function getLastMaintenanceRun(db: BetterSqlite3.Database): MaintenanceRun | null {
  const row = db.prepare("SELECT * FROM maintenance_runs ORDER BY ran_at DESC LIMIT 1").get() as
    | MaintenanceRow
    | undefined;
  return row ? maintenanceRowToRun(row) : null;
}

export function deleteEmptySessions(db: BetterSqlite3.Database): number {
  const result = db
    .prepare("DELETE FROM sessions WHERE id NOT IN (SELECT DISTINCT session_id FROM chunks)")
    .run();
  return result.changes;
}

export function deleteOldestChunksPercent(db: BetterSqlite3.Database, percent: number): number {
  const result = db
    .prepare(
      `DELETE FROM chunks WHERE id IN (
         SELECT id FROM chunks ORDER BY created_at ASC
         LIMIT (SELECT MAX(1, COUNT(*) * ? / 100) FROM chunks)
       )`,
    )
    .run(percent);
  return result.changes;
}

interface CountRow {
  count: number;
}

interface ProjectDistributionRow {
  project_id: string;
  chunk_count: number;
}

export interface DatabaseStats {
  databaseSizeBytes: number;
  sessionCount: number;
  chunkCount: number;
  oldestChunkDate: string | null;
  newestChunkDate: string | null;
  lastMaintenanceAt: string | null;
  projectDistribution: Array<{ projectId: string; chunkCount: number }>;
}

export function getStats(db: BetterSqlite3.Database): DatabaseStats {
  const sessionCount = (db.prepare("SELECT COUNT(*) AS count FROM sessions").get() as CountRow)
    .count;

  const chunkCount = (db.prepare("SELECT COUNT(*) AS count FROM chunks").get() as CountRow).count;

  const chunkDateRange = db
    .prepare("SELECT MIN(created_at) AS oldest, MAX(created_at) AS newest FROM chunks")
    .get() as { oldest: string | null; newest: string | null };

  const databaseSizeBytes = getDatabaseSizeBytes(db);

  const lastMaintenance = getLastMaintenanceRun(db);

  const projectDistribution = db
    .prepare(
      `SELECT s.project_id, COUNT(c.id) AS chunk_count
       FROM sessions s
       JOIN chunks c ON c.session_id = s.id
       GROUP BY s.project_id
       ORDER BY chunk_count DESC`,
    )
    .all() as ProjectDistributionRow[];

  return {
    databaseSizeBytes,
    sessionCount,
    chunkCount,
    oldestChunkDate: chunkDateRange.oldest,
    newestChunkDate: chunkDateRange.newest,
    lastMaintenanceAt: lastMaintenance?.ranAt ?? null,
    projectDistribution: projectDistribution.map((row) => ({
      projectId: row.project_id,
      chunkCount: row.chunk_count,
    })),
  };
}

export function getDatabaseSizeBytes(db: BetterSqlite3.Database): number {
  const row = db
    .prepare(
      "SELECT (page_count - freelist_count) * page_size AS size FROM pragma_page_count(), pragma_page_size(), pragma_freelist_count()",
    )
    .get() as { size: number };
  return row.size;
}

export function walCheckpoint(db: BetterSqlite3.Database): void {
  db.pragma("wal_checkpoint(TRUNCATE)");
}

export function vacuum(db: BetterSqlite3.Database): void {
  db.exec("VACUUM");
}
