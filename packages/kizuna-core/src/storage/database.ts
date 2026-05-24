import BetterSqlite3 from "better-sqlite3";
import type {
  Session,
  RawChunk,
  StoredChunk,
  SearchResult,
  MaintenanceResult,
  MaintenanceRun,
  SessionPreview,
  SessionListItem,
} from "../index.js";
import { runCoreMigrations } from "./migrator.js";
import * as sessionQueries from "./queries/session.js";
import * as chunkQueries from "./queries/chunk.js";
import * as maintenanceQueries from "./queries/maintenance.js";

export interface DatabaseOptions {
  readonly?: boolean;
}

export class Database {
  readonly db: BetterSqlite3.Database;

  constructor(dbPath: string, options?: DatabaseOptions) {
    if (options?.readonly) {
      this.db = new BetterSqlite3(dbPath, { readonly: true });
      this.db.pragma("busy_timeout = 5000");
    } else {
      this.db = new BetterSqlite3(dbPath);
      this.db.pragma("journal_mode = WAL");
      this.db.pragma("synchronous = NORMAL");
      this.db.pragma("busy_timeout = 5000");
      this.db.pragma("foreign_keys = ON");
      runCoreMigrations(this.db);
    }
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
    sessionQueries.insertSession(this.db, session);
  }

  getSession(id: string): Session | null {
    return sessionQueries.getSession(this.db, id);
  }

  upsertSession(session: Session): void {
    sessionQueries.upsertSession(this.db, session);
  }

  getLatestSession(): Session | null {
    return sessionQueries.getLatestSession(this.db);
  }

  getLatestSessionWithChunks(): Session | null {
    return sessionQueries.getLatestSessionWithChunks(this.db);
  }

  getLatestSessionsWithChunks(count: number): Session[] {
    return sessionQueries.getLatestSessionsWithChunks(this.db, count);
  }

  listSessionsWithPreview(limit: number = 10): SessionPreview[] {
    return sessionQueries.listSessionsWithPreview(this.db, limit);
  }

  listSessionsPaginated(
    offset: number,
    limit: number,
  ): { sessions: SessionListItem[]; total: number } {
    return sessionQueries.listSessionsPaginated(this.db, offset, limit);
  }

  getSessionsByDate(date: string): Session[] {
    return sessionQueries.getSessionsByDate(this.db, date);
  }

  getSessionsByIdPrefix(prefix: string): Session[] {
    return sessionQueries.getSessionsByIdPrefix(this.db, prefix);
  }

  getMaxTurnIndex(sessionId: string): number | null {
    return sessionQueries.getMaxTurnIndex(this.db, sessionId);
  }

  // ─── Chunks ───────────────────────────────────────────

  insertChunk(
    chunk: RawChunk & { tokenCount?: number; importance?: number; createdAt?: string },
  ): StoredChunk {
    return chunkQueries.insertChunk(this.db, chunk);
  }

  getChunk(id: number): StoredChunk | null {
    return chunkQueries.getChunk(this.db, id);
  }

  getChunksBySession(sessionId: string): StoredChunk[] {
    return chunkQueries.getChunksBySession(this.db, sessionId);
  }

  deleteChunks(ids: number[]): number {
    return chunkQueries.deleteChunks(this.db, ids);
  }

  deleteChunksBefore(date: string): number {
    return chunkQueries.deleteChunksBefore(this.db, date);
  }

  // ─── Search ───────────────────────────────────────────

  searchChunks(
    query: string,
    limit: number = 10,
    halfLifeDays: number = 30,
    likePatterns: string[] = [],
  ): SearchResult[] {
    return chunkQueries.searchChunks(this.db, query, limit, halfLifeDays, likePatterns);
  }

  searchChunksLikeOnly(
    likePatterns: string[],
    limit: number = 10,
    halfLifeDays: number = 30,
  ): SearchResult[] {
    return chunkQueries.searchChunksLikeOnly(this.db, likePatterns, limit, halfLifeDays);
  }

  // ─── Maintenance ──────────────────────────────────────

  insertMaintenanceRun(result: MaintenanceResult, ranAt?: string): void {
    maintenanceQueries.insertMaintenanceRun(this.db, result, ranAt);
  }

  getLastMaintenanceRun(): MaintenanceRun | null {
    return maintenanceQueries.getLastMaintenanceRun(this.db);
  }

  deleteEmptySessions(): number {
    return maintenanceQueries.deleteEmptySessions(this.db);
  }

  deleteOldestChunksPercent(percent: number): number {
    return maintenanceQueries.deleteOldestChunksPercent(this.db, percent);
  }

  getStats(): maintenanceQueries.DatabaseStats {
    return maintenanceQueries.getStats(this.db);
  }

  getDatabaseSizeBytes(): number {
    return maintenanceQueries.getDatabaseSizeBytes(this.db);
  }

  walCheckpoint(): void {
    maintenanceQueries.walCheckpoint(this.db);
  }

  vacuum(): void {
    maintenanceQueries.vacuum(this.db);
  }
}
