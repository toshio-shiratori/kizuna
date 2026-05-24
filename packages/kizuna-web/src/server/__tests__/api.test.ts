import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { Database } from "@kizuna/core";
import type {
  DatabaseStats,
  PaginatedResult,
  SessionListItem,
  Session,
  StoredChunk,
} from "@kizuna/core";
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

  describe("GET /sessions", () => {
    it("returns empty items and total 0 for an empty database", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/sessions");
      expect(res.status).toBe(200);

      const body = (await res.json()) as PaginatedResult<SessionListItem>;
      expect(body.items).toEqual([]);
      expect(body.total).toBe(0);
      expect(body.page).toBe(1);
      expect(body.limit).toBe(20);
      expect(body.totalPages).toBe(0);
    });

    it("returns paginated results with data", async () => {
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
        content: "First line\nSecond line",
        metadata: {},
        createdAt: "2025-01-01T00:00:00Z",
      });
      db.insertChunk({
        sessionId: "session-1",
        turnIndex: 1,
        role: "assistant",
        content: "Reply",
        metadata: {},
        createdAt: "2025-01-01T00:30:00Z",
      });

      db.insertSession({
        id: "session-2",
        projectId: "project-beta",
        startedAt: "2025-06-15T00:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      db.insertChunk({
        sessionId: "session-2",
        turnIndex: 0,
        role: "user",
        content: "Another session",
        metadata: {},
        createdAt: "2025-06-15T00:00:00Z",
      });

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/sessions?limit=10");
      expect(res.status).toBe(200);

      const body = (await res.json()) as PaginatedResult<SessionListItem>;
      expect(body.total).toBe(2);
      expect(body.items).toHaveLength(2);
      expect(body.page).toBe(1);
      expect(body.totalPages).toBe(1);

      // Ordered by started_at DESC
      expect(body.items[0]!.sessionId).toBe("session-2");
      expect(body.items[0]!.chunkCount).toBe(1);
      expect(body.items[0]!.preview).toBe("Another session");

      expect(body.items[1]!.sessionId).toBe("session-1");
      expect(body.items[1]!.chunkCount).toBe(2);
      expect(body.items[1]!.preview).toBe("First line");
    });

    it("supports pagination with page parameter", async () => {
      // Create 3 sessions
      for (let i = 1; i <= 3; i++) {
        db.insertSession({
          id: `session-${i}`,
          projectId: "project-alpha",
          startedAt: `2025-0${i}-01T00:00:00Z`,
          endedAt: null,
          transcriptPath: null,
          metadata: {},
        });
        db.insertChunk({
          sessionId: `session-${i}`,
          turnIndex: 0,
          role: "user",
          content: `Content ${i}`,
          metadata: {},
          createdAt: `2025-0${i}-01T00:00:00Z`,
        });
      }

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      // Page 1 with limit 2
      const res1 = await app.request("/api/sessions?page=1&limit=2");
      const body1 = (await res1.json()) as PaginatedResult<SessionListItem>;
      expect(body1.total).toBe(3);
      expect(body1.items).toHaveLength(2);
      expect(body1.page).toBe(1);
      expect(body1.totalPages).toBe(2);
      // DESC order: session-3, session-2
      expect(body1.items[0]!.sessionId).toBe("session-3");
      expect(body1.items[1]!.sessionId).toBe("session-2");

      // Page 2 with limit 2
      const res2 = await app.request("/api/sessions?page=2&limit=2");
      const body2 = (await res2.json()) as PaginatedResult<SessionListItem>;
      expect(body2.total).toBe(3);
      expect(body2.items).toHaveLength(1);
      expect(body2.page).toBe(2);
      expect(body2.items[0]!.sessionId).toBe("session-1");
    });
  });

  describe("GET /sessions/:id/chunks", () => {
    it("returns session and chunks", async () => {
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
        content: "Hello",
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

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/sessions/session-1/chunks");
      expect(res.status).toBe(200);

      const body = (await res.json()) as { session: Session; chunks: StoredChunk[] };
      expect(body.session.id).toBe("session-1");
      expect(body.session.projectId).toBe("project-alpha");
      expect(body.chunks).toHaveLength(2);
      expect(body.chunks[0]!.role).toBe("user");
      expect(body.chunks[0]!.content).toBe("Hello");
      expect(body.chunks[1]!.role).toBe("assistant");
      expect(body.chunks[1]!.content).toBe("Hi there");
    });

    it("returns 404 for non-existent session", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/sessions/non-existent/chunks");
      expect(res.status).toBe(404);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Session not found");
    });
  });
});
