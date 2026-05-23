import { Hono } from "hono";
import type { Database } from "@kizuna/core";

interface CountRow {
  count: number;
}

interface ProjectDistributionRow {
  project_id: string;
  chunk_count: number;
}

export interface StatsResponse {
  databaseSizeBytes: number;
  sessionCount: number;
  chunkCount: number;
  oldestChunkDate: string | null;
  newestChunkDate: string | null;
  lastMaintenanceAt: string | null;
  projectDistribution: Array<{ projectId: string; chunkCount: number }>;
}

export function createApiRoutes(db: Database): Hono {
  const api = new Hono();

  api.get("/health", (c) => {
    return c.json({ ok: true });
  });

  api.get("/stats", (c) => {
    const sessionCount = (db.db.prepare("SELECT COUNT(*) AS count FROM sessions").get() as CountRow)
      .count;

    const chunkCount = (db.db.prepare("SELECT COUNT(*) AS count FROM chunks").get() as CountRow)
      .count;

    const chunkDateRange = db.db
      .prepare("SELECT MIN(created_at) AS oldest, MAX(created_at) AS newest FROM chunks")
      .get() as { oldest: string | null; newest: string | null };

    const databaseSizeBytes = db.getDatabaseSizeBytes();

    const lastMaintenance = db.getLastMaintenanceRun();

    const projectDistribution = db.db
      .prepare(
        `SELECT s.project_id, COUNT(c.id) AS chunk_count
         FROM sessions s
         JOIN chunks c ON c.session_id = s.id
         GROUP BY s.project_id
         ORDER BY chunk_count DESC`,
      )
      .all() as ProjectDistributionRow[];

    const response: StatsResponse = {
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

    return c.json(response);
  });

  return api;
}
