import type { Database } from "../storage/database.js";
import type { MaintenanceResult } from "../index.js";

export interface MaintenanceOptions {
  retentionDays?: number; // default 90
  maxDbSizeBytes?: number; // default 100 * 1024 * 1024 (100MB)
  throttleHours?: number; // default 24
  now?: Date; // for testing, defaults to new Date()
}

const DEFAULT_RETENTION_DAYS = 90;
const DEFAULT_MAX_DB_SIZE_BYTES = 100 * 1024 * 1024; // 100MB
const DEFAULT_THROTTLE_HOURS = 24;

/**
 * Returns null if throttled (skipped), MaintenanceResult if executed.
 */
export function runMaintenance(
  db: Database,
  options?: MaintenanceOptions,
): MaintenanceResult | null {
  const now = options?.now ?? new Date();
  const retentionDays = options?.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const maxDbSizeBytes = options?.maxDbSizeBytes ?? DEFAULT_MAX_DB_SIZE_BYTES;
  const throttleHours = options?.throttleHours ?? DEFAULT_THROTTLE_HOURS;

  // Step 1: Check throttle
  const lastRun = db.getLastMaintenanceRun();
  if (lastRun !== null) {
    const lastRanAt = new Date(lastRun.ran_at);
    const elapsedMs = now.getTime() - lastRanAt.getTime();
    const throttleMs = throttleHours * 60 * 60 * 1000;
    if (elapsedMs < throttleMs) {
      return null;
    }
  }

  const startTime = Date.now();

  // Step 2: Record start size
  const startSize = db.getDatabaseSizeBytes();

  // Step 3: Delete old chunks
  const cutoffDate = new Date(now);
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
  const chunksDeletedByAge = db.deleteChunksBefore(cutoffDate.toISOString());

  // Step 4: Cap database size
  let chunksDeletedByCap = 0;
  const currentSize = db.getDatabaseSizeBytes();
  if (currentSize > maxDbSizeBytes) {
    chunksDeletedByCap = db.deleteOldestChunksPercent(10);
  }

  // Step 5: Delete empty sessions
  const sessionsDeleted = db.deleteEmptySessions();

  // Step 6: Vacuum WAL
  db.walCheckpoint();

  // Step 7: VACUUM (only if deletions occurred)
  const totalDeleted = chunksDeletedByAge + chunksDeletedByCap + sessionsDeleted;
  if (totalDeleted > 0) {
    db.vacuum();
  }

  // Step 8: Record end size
  const endSize = db.getDatabaseSizeBytes();
  const bytesReclaimed = Math.max(0, startSize - endSize);

  const durationMs = Date.now() - startTime;

  const result: MaintenanceResult = {
    chunksDeleted: chunksDeletedByAge + chunksDeletedByCap,
    sessionsDeleted,
    bytesReclaimed,
    durationMs,
  };

  // Step 9: Record the run
  db.insertMaintenanceRun(result, now.toISOString());

  return result;
}
