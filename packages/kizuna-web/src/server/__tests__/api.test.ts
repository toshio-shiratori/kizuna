import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { Database } from "@kizuna/core";
import type { DatabaseStats } from "@kizuna/core";
import { createApiRoutes } from "../routes/api.js";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
});

afterEach(() => {
  db.close();
});

describe("API routes", () => {
  it("GET /health returns { ok: true }", async () => {
    const app = new Hono();
    app.route("/api", createApiRoutes(db));

    const res = await app.request("/api/health");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { ok: boolean };
    expect(body).toEqual({ ok: true });
  });

  describe("GET /stats", () => {
    it("returns zeros for an empty database", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/stats");
      expect(res.status).toBe(200);

      const body = (await res.json()) as DatabaseStats;
      expect(body.databaseSizeBytes).toBeGreaterThanOrEqual(0);
      expect(body.sessionCount).toBe(0);
      expect(body.chunkCount).toBe(0);
      expect(body.oldestChunkDate).toBeNull();
      expect(body.newestChunkDate).toBeNull();
      expect(body.lastMaintenanceAt).toBeNull();
      expect(body.projectDistribution).toEqual([]);
    });

    it("returns correct stats when data exists", async () => {
      db.insertSession({
        id: "session-1",
        projectId: "project-alpha",
        startedAt: "2025-01-01T00:00:00Z",
        endedAt: "2025-01-01T01:00:00Z",
        transcriptPath: null,
        metadata: {},
      });

      db.insertChunk({
        sessionId: "session-1",
        turnIndex: 0,
        role: "user",
        content: "Hello world",
        metadata: {},
        createdAt: "2025-01-01T00:00:00Z",
      });

      db.insertChunk({
        sessionId: "session-1",
        turnIndex: 1,
        role: "assistant",
        content: "Hi there",
        metadata: {},
        createdAt: "2025-01-01T00:30:00Z",
      });

      db.insertSession({
        id: "session-2",
        projectId: "project-beta",
        startedAt: "2025-06-15T00:00:00Z",
        endedAt: "2025-06-15T01:00:00Z",
        transcriptPath: null,
        metadata: {},
      });

      db.insertChunk({
        sessionId: "session-2",
        turnIndex: 0,
        role: "user",
        content: "Another chunk",
        metadata: {},
        createdAt: "2025-06-15T00:00:00Z",
      });

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/stats");
      expect(res.status).toBe(200);

      const body = (await res.json()) as DatabaseStats;
      expect(body.sessionCount).toBe(2);
      expect(body.chunkCount).toBe(3);
      expect(body.oldestChunkDate).toBe("2025-01-01T00:00:00Z");
      expect(body.newestChunkDate).toBe("2025-06-15T00:00:00Z");
      expect(body.lastMaintenanceAt).toBeNull();
      expect(body.projectDistribution).toEqual([
        { projectId: "project-alpha", chunkCount: 2 },
        { projectId: "project-beta", chunkCount: 1 },
      ]);
    });

    it("returns lastMaintenanceAt when maintenance has run", async () => {
      db.insertMaintenanceRun(
        {
          chunksDeleted: 5,
          sessionsDeleted: 1,
          bytesReclaimed: 1024,
          durationMs: 42,
        },
        "2025-03-15T10:00:00Z",
      );

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/stats");
      const body = (await res.json()) as DatabaseStats;
      expect(body.lastMaintenanceAt).toBe("2025-03-15T10:00:00Z");
    });
  });
});
