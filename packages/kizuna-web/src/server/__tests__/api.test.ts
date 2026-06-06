import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { Database } from "@kizuna/core";
import type {
  DatabaseStats,
  PaginatedResult,
  SessionListItem,
  Session,
  StoredChunk,
  SearchResult,
  Report,
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

  describe("GET /config", () => {
    it("returns write: false by default", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/config");
      expect(res.status).toBe(200);

      const body = (await res.json()) as { write: boolean };
      expect(body.write).toBe(false);
    });

    it("returns write: false when write option is false", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db, { write: false }));

      const res = await app.request("/api/config");
      expect(res.status).toBe(200);

      const body = (await res.json()) as { write: boolean };
      expect(body.write).toBe(false);
    });

    it("returns write: true when write option is true", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db, { write: true }));

      const res = await app.request("/api/config");
      expect(res.status).toBe(200);

      const body = (await res.json()) as { write: boolean };
      expect(body.write).toBe(true);
    });
  });

  describe("PATCH /chunks/:id", () => {
    it("returns 403 when write mode is not enabled", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db, { write: false }));

      const res = await app.request("/api/chunks/1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importance: 7 }),
      });
      expect(res.status).toBe(403);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Write mode is not enabled");
    });

    it("returns 403 when options are not provided", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/chunks/1", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importance: 7 }),
      });
      expect(res.status).toBe(403);
    });

    it("returns 400 for invalid chunk ID", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db, { write: true }));

      const res = await app.request("/api/chunks/abc", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importance: 7 }),
      });
      expect(res.status).toBe(400);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Invalid chunk ID");
    });

    it("returns 400 for invalid importance values", async () => {
      db.insertSession({
        id: "session-1",
        projectId: "project-alpha",
        startedAt: "2025-01-01T00:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      const chunk = db.insertChunk({
        sessionId: "session-1",
        turnIndex: 0,
        role: "user",
        content: "Hello",
        metadata: {},
        createdAt: "2025-01-01T00:00:00Z",
      });

      const app = new Hono();
      app.route("/api", createApiRoutes(db, { write: true }));

      // Non-integer
      const res1 = await app.request(`/api/chunks/${chunk.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importance: 5.5 }),
      });
      expect(res1.status).toBe(400);

      // Negative
      const res2 = await app.request(`/api/chunks/${chunk.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importance: -1 }),
      });
      expect(res2.status).toBe(400);

      // Over 10
      const res3 = await app.request(`/api/chunks/${chunk.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importance: 11 }),
      });
      expect(res3.status).toBe(400);

      // Not a number
      const res4 = await app.request(`/api/chunks/${chunk.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importance: "high" }),
      });
      expect(res4.status).toBe(400);
    });

    it("returns 404 for non-existent chunk", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db, { write: true }));

      const res = await app.request("/api/chunks/99999", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importance: 7 }),
      });
      expect(res.status).toBe(404);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Chunk not found");
    });

    it("updates chunk importance successfully", async () => {
      db.insertSession({
        id: "session-1",
        projectId: "project-alpha",
        startedAt: "2025-01-01T00:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      const chunk = db.insertChunk({
        sessionId: "session-1",
        turnIndex: 0,
        role: "user",
        content: "Hello",
        metadata: {},
        createdAt: "2025-01-01T00:00:00Z",
      });

      const app = new Hono();
      app.route("/api", createApiRoutes(db, { write: true }));

      const res = await app.request(`/api/chunks/${chunk.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importance: 8 }),
      });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { ok: boolean; id: number; importance: number };
      expect(body.ok).toBe(true);
      expect(body.id).toBe(chunk.id);
      expect(body.importance).toBe(8);

      // Verify in DB
      const got = db.getChunk(chunk.id);
      expect(got!.importance).toBe(8);
    });
  });

  describe("DELETE /chunks/:id", () => {
    it("returns 403 when write mode is not enabled", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db, { write: false }));

      const res = await app.request("/api/chunks/1", { method: "DELETE" });
      expect(res.status).toBe(403);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Write mode is not enabled");
    });

    it("returns 403 when options are not provided", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/chunks/1", { method: "DELETE" });
      expect(res.status).toBe(403);
    });

    it("returns 400 for invalid chunk ID", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db, { write: true }));

      const res = await app.request("/api/chunks/abc", { method: "DELETE" });
      expect(res.status).toBe(400);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Invalid chunk ID");
    });

    it("returns 404 for non-existent chunk", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db, { write: true }));

      const res = await app.request("/api/chunks/99999", { method: "DELETE" });
      expect(res.status).toBe(404);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Chunk not found");
    });

    it("deletes a chunk successfully", async () => {
      db.insertSession({
        id: "session-1",
        projectId: "project-alpha",
        startedAt: "2025-01-01T00:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      const chunk = db.insertChunk({
        sessionId: "session-1",
        turnIndex: 0,
        role: "user",
        content: "Hello",
        metadata: {},
        createdAt: "2025-01-01T00:00:00Z",
      });

      const app = new Hono();
      app.route("/api", createApiRoutes(db, { write: true }));

      const res = await app.request(`/api/chunks/${chunk.id}`, { method: "DELETE" });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { ok: boolean };
      expect(body.ok).toBe(true);

      // Verify deleted
      expect(db.getChunk(chunk.id)).toBeNull();
    });
  });

  describe("GET /search", () => {
    it("returns 400 when q is missing", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/search");
      expect(res.status).toBe(400);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Missing required parameter: q");
    });

    it("returns 400 when q is empty", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/search?q=");
      expect(res.status).toBe(400);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Missing required parameter: q");
    });

    it("returns 400 when q is whitespace only", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/search?q=%20%20");
      expect(res.status).toBe(400);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Missing required parameter: q");
    });

    it("returns empty results for query with no matches", async () => {
      db.insertSession({
        id: "session-1",
        projectId: "project-alpha",
        startedAt: new Date().toISOString(),
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      db.insertChunk({
        sessionId: "session-1",
        turnIndex: 0,
        role: "user",
        content: "Hello world",
        metadata: {},
        createdAt: new Date().toISOString(),
      });

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/search?q=nonexistent");
      expect(res.status).toBe(200);

      const body = (await res.json()) as { results: SearchResult[]; query: string };
      expect(body.results).toEqual([]);
      expect(body.query).toBe("nonexistent");
    });

    it("returns results with scores for matching content", async () => {
      const now = new Date().toISOString();
      db.insertSession({
        id: "session-1",
        projectId: "project-alpha",
        startedAt: now,
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      db.insertChunk({
        sessionId: "session-1",
        turnIndex: 0,
        role: "user",
        content: "TypeScript is a typed superset of JavaScript",
        metadata: {},
        createdAt: now,
      });
      db.insertChunk({
        sessionId: "session-1",
        turnIndex: 1,
        role: "assistant",
        content: "Yes, TypeScript adds static typing to JavaScript",
        metadata: {},
        createdAt: now,
      });

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/search?q=TypeScript");
      expect(res.status).toBe(200);

      const body = (await res.json()) as { results: SearchResult[]; query: string };
      expect(body.query).toBe("TypeScript");
      expect(body.results.length).toBeGreaterThan(0);
      for (const result of body.results) {
        expect(result.score).toBeGreaterThan(0);
        expect(result.chunk.content.toLowerCase()).toContain("typescript");
      }
    });

    it("respects limit parameter", async () => {
      const now = new Date().toISOString();
      db.insertSession({
        id: "session-1",
        projectId: "project-alpha",
        startedAt: now,
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });

      for (let i = 0; i < 5; i++) {
        db.insertChunk({
          sessionId: "session-1",
          turnIndex: i,
          role: "user",
          content: `Testing chunk number ${i} with testing content`,
          metadata: {},
          createdAt: now,
        });
      }

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/search?q=testing&limit=2");
      expect(res.status).toBe(200);

      const body = (await res.json()) as { results: SearchResult[]; query: string };
      expect(body.results.length).toBeLessThanOrEqual(2);
    });

    it("results are sorted by score descending", async () => {
      const now = new Date().toISOString();
      db.insertSession({
        id: "session-1",
        projectId: "project-alpha",
        startedAt: now,
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });

      db.insertChunk({
        sessionId: "session-1",
        turnIndex: 0,
        role: "user",
        content: "apple banana cherry",
        metadata: {},
        createdAt: now,
      });
      db.insertChunk({
        sessionId: "session-1",
        turnIndex: 1,
        role: "user",
        content: "apple apple apple apple apple",
        metadata: {},
        createdAt: now,
      });

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/search?q=apple");
      expect(res.status).toBe(200);

      const body = (await res.json()) as { results: SearchResult[]; query: string };
      expect(body.results.length).toBe(2);
      // Scores should be in descending order
      for (let i = 1; i < body.results.length; i++) {
        expect(body.results[i - 1]!.score).toBeGreaterThanOrEqual(body.results[i]!.score);
      }
    });
  });

  describe("POST /reports", () => {
    it("returns 403 when write mode is not enabled", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db, { write: false }));

      const res = await app.request("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "analysis",
          source: "webui",
          title: "Test Analysis",
          content: "Analysis content",
        }),
      });
      expect(res.status).toBe(403);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Write mode is not enabled");
    });

    it("returns 403 when options are not provided", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "analysis",
          source: "webui",
          title: "Test Analysis",
          content: "Analysis content",
        }),
      });
      expect(res.status).toBe(403);
    });

    it("creates a report and returns 201 when write mode is enabled", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db, { write: true }));

      const res = await app.request("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "analysis",
          source: "webui",
          title: "Test Analysis",
          content: "Analysis content",
        }),
      });
      expect(res.status).toBe(201);

      const body = (await res.json()) as Report;
      expect(body.id).toBeGreaterThan(0);
      expect(body.type).toBe("analysis");
      expect(body.source).toBe("webui");
      expect(body.title).toBe("Test Analysis");
      expect(body.content).toBe("Analysis content");
      expect(body.status).toBe("unread");
    });

    it("returns 400 for missing fields", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db, { write: true }));

      const res = await app.request("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "analysis" }),
      });
      expect(res.status).toBe(400);

      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("Missing required fields");
    });
  });

  describe("GET /reports", () => {
    it("returns list of reports", async () => {
      db.insertReport({
        type: "analysis",
        source: "webui",
        title: "Report 1",
        content: "Content 1",
      });
      db.insertReport({
        type: "proposal",
        source: "claude",
        title: "Report 2",
        content: "Content 2",
      });

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/reports");
      expect(res.status).toBe(200);

      const body = (await res.json()) as { reports: Report[]; total: number };
      expect(body.total).toBe(2);
      expect(body.reports).toHaveLength(2);
    });

    it("returns reports filtered by status", async () => {
      db.insertReport({
        type: "analysis",
        source: "webui",
        title: "Unread",
        content: "content",
      });
      const r2 = db.insertReport({
        type: "proposal",
        source: "claude",
        title: "Read",
        content: "content",
      });
      db.updateReportStatus(r2.id, "read");

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/reports?status=unread");
      expect(res.status).toBe(200);

      const body = (await res.json()) as { reports: Report[]; total: number };
      expect(body.total).toBe(1);
      expect(body.reports[0]!.title).toBe("Unread");
    });

    it("returns reports filtered by type and source", async () => {
      db.insertReport({
        type: "analysis",
        source: "webui",
        title: "Analysis from WebUI",
        content: "content",
      });
      db.insertReport({
        type: "proposal",
        source: "claude",
        title: "Proposal from Claude",
        content: "content",
      });

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/reports?type=proposal&source=claude");
      expect(res.status).toBe(200);

      const body = (await res.json()) as { reports: Report[]; total: number };
      expect(body.total).toBe(1);
      expect(body.reports[0]!.title).toBe("Proposal from Claude");
    });
  });

  describe("PATCH /reports/:id", () => {
    it("updates report status", async () => {
      const report = db.insertReport({
        type: "analysis",
        source: "webui",
        title: "Test",
        content: "content",
      });

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request(`/api/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "read" }),
      });
      expect(res.status).toBe(200);

      const body = (await res.json()) as Report;
      expect(body.status).toBe("read");

      // Verify in DB
      const got = db.getReport(report.id);
      expect(got!.status).toBe("read");
    });

    it("returns 404 for non-existent report", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/reports/99999", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "read" }),
      });
      expect(res.status).toBe(404);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Report not found");
    });

    it("returns 400 for invalid status", async () => {
      const report = db.insertReport({
        type: "analysis",
        source: "webui",
        title: "Test",
        content: "content",
      });

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request(`/api/reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "invalid" }),
      });
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /reports/:id", () => {
    it("deletes a report", async () => {
      const report = db.insertReport({
        type: "analysis",
        source: "webui",
        title: "To Delete",
        content: "content",
      });

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request(`/api/reports/${report.id}`, {
        method: "DELETE",
      });
      expect(res.status).toBe(200);

      const body = (await res.json()) as { ok: boolean };
      expect(body.ok).toBe(true);

      // Verify deleted
      expect(db.getReport(report.id)).toBeNull();
    });

    it("returns 404 for non-existent report", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/reports/99999", {
        method: "DELETE",
      });
      expect(res.status).toBe(404);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Report not found");
    });
  });

  describe("GET /export/session/:id", () => {
    function seedSession() {
      db.insertSession({
        id: "session-export-1",
        projectId: "project-alpha",
        startedAt: "2025-01-01T00:00:00Z",
        endedAt: "2025-01-01T01:00:00Z",
        transcriptPath: null,
        metadata: {},
      });
      db.insertChunk({
        sessionId: "session-export-1",
        turnIndex: 0,
        role: "user",
        content: "Hello export test",
        metadata: {},
        createdAt: "2025-01-01T00:00:00Z",
      });
      db.insertChunk({
        sessionId: "session-export-1",
        turnIndex: 1,
        role: "assistant",
        content: "Export reply",
        metadata: {},
        createdAt: "2025-01-01T00:30:00Z",
      });
    }

    it("returns 404 for non-existent session", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/export/session/non-existent");
      expect(res.status).toBe(404);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Session not found");
    });

    it("returns 400 for invalid format", async () => {
      seedSession();

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/export/session/session-export-1?format=xml");
      expect(res.status).toBe(400);

      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("Invalid format");
    });

    it("exports session as JSON with correct headers", async () => {
      seedSession();

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/export/session/session-export-1?format=json");
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
      expect(res.headers.get("Content-Disposition")).toContain("attachment");
      expect(res.headers.get("Content-Disposition")).toContain("kizuna-session-session-");
      expect(res.headers.get("Content-Disposition")).toContain(".json");

      const text = await res.text();
      const parsed = JSON.parse(text) as { meta: { chunkCount: number }; chunks: unknown[] };
      expect(parsed.meta.chunkCount).toBe(2);
      expect(parsed.chunks).toHaveLength(2);
    });

    it("exports session as Markdown with correct headers", async () => {
      seedSession();

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/export/session/session-export-1?format=markdown");
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
      expect(res.headers.get("Content-Disposition")).toContain(".md");

      const text = await res.text();
      expect(text.startsWith("# Kizuna Memory Export")).toBe(true);
    });

    it("defaults to JSON format when format is not specified", async () => {
      seedSession();

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/export/session/session-export-1");
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/json; charset=utf-8");

      const text = await res.text();
      const parsed = JSON.parse(text) as { chunks: unknown[] };
      expect(parsed.chunks).toHaveLength(2);
    });

    it("includes truncation warning in JSON when chunks exceed limit", async () => {
      seedSession();

      const app = new Hono();
      app.route("/api", createApiRoutes(db, { write: false, sessionExportLimit: 1 }));

      const res = await app.request("/api/export/session/session-export-1?format=json");
      expect(res.status).toBe(200);

      const text = await res.text();
      const parsed = JSON.parse(text) as {
        meta: { truncated: boolean; totalAvailable: number; chunkCount: number };
        chunks: unknown[];
      };
      expect(parsed.meta.truncated).toBe(true);
      expect(parsed.meta.totalAvailable).toBe(2);
      expect(parsed.meta.chunkCount).toBe(1);
      expect(parsed.chunks).toHaveLength(1);
    });

    it("includes truncation warning in Markdown when chunks exceed limit", async () => {
      seedSession();

      const app = new Hono();
      app.route("/api", createApiRoutes(db, { write: false, sessionExportLimit: 1 }));

      const res = await app.request("/api/export/session/session-export-1?format=markdown");
      expect(res.status).toBe(200);

      const text = await res.text();
      expect(text.startsWith("> **Warning**:")).toBe(true);
      expect(text).toContain("1 of 2");
    });

    it("does not include truncation warning when all chunks fit", async () => {
      seedSession();

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/export/session/session-export-1?format=json");
      expect(res.status).toBe(200);

      const text = await res.text();
      const parsed = JSON.parse(text) as { meta: { truncated?: boolean } };
      expect(parsed.meta.truncated).toBeUndefined();
    });
  });

  describe("GET /export/search", () => {
    function seedSearchData() {
      const now = new Date().toISOString();
      db.insertSession({
        id: "session-search-export",
        projectId: "project-alpha",
        startedAt: now,
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      db.insertChunk({
        sessionId: "session-search-export",
        turnIndex: 0,
        role: "user",
        content: "TypeScript export testing content",
        metadata: {},
        createdAt: now,
      });
      db.insertChunk({
        sessionId: "session-search-export",
        turnIndex: 1,
        role: "assistant",
        content: "TypeScript is great for export",
        metadata: {},
        createdAt: now,
      });
    }

    it("returns 400 when q is missing", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/export/search");
      expect(res.status).toBe(400);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Missing required parameter: q");
    });

    it("returns 400 when q is empty", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/export/search?q=");
      expect(res.status).toBe(400);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Missing required parameter: q");
    });

    it("returns 400 for invalid format", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/export/search?q=test&format=csv");
      expect(res.status).toBe(400);

      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("Invalid format");
    });

    it("exports search results as JSON with correct headers", async () => {
      seedSearchData();

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/export/search?q=TypeScript&format=json");
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
      expect(res.headers.get("Content-Disposition")).toContain("attachment");
      expect(res.headers.get("Content-Disposition")).toContain("kizuna-search-TypeScript");
      expect(res.headers.get("Content-Disposition")).toContain(".json");

      const text = await res.text();
      const parsed = JSON.parse(text) as { meta: { chunkCount: number }; chunks: unknown[] };
      expect(parsed.chunks.length).toBeGreaterThan(0);
      expect(parsed.meta.chunkCount).toBe(parsed.chunks.length);
    });

    it("exports search results as Markdown with correct headers", async () => {
      seedSearchData();

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/export/search?q=TypeScript&format=markdown");
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("text/markdown; charset=utf-8");
      expect(res.headers.get("Content-Disposition")).toContain(".md");

      const text = await res.text();
      expect(text.startsWith("# Kizuna Memory Export")).toBe(true);
    });

    it("defaults to JSON format when format is not specified", async () => {
      seedSearchData();

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/export/search?q=TypeScript");
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    });

    it("respects limit parameter", async () => {
      const now = new Date().toISOString();
      db.insertSession({
        id: "session-limit-export",
        projectId: "project-alpha",
        startedAt: now,
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });

      for (let i = 0; i < 5; i++) {
        db.insertChunk({
          sessionId: "session-limit-export",
          turnIndex: i,
          role: "user",
          content: `Export limit testing chunk number ${i}`,
          metadata: {},
          createdAt: now,
        });
      }

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request(
        "/api/export/search?q=Export+limit+testing&format=json&limit=2",
      );
      expect(res.status).toBe(200);

      const text = await res.text();
      const parsed = JSON.parse(text) as { chunks: unknown[] };
      expect(parsed.chunks.length).toBeLessThanOrEqual(2);
    });

    it("returns empty export when no matches found", async () => {
      db.insertSession({
        id: "session-empty-export",
        projectId: "project-alpha",
        startedAt: new Date().toISOString(),
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      db.insertChunk({
        sessionId: "session-empty-export",
        turnIndex: 0,
        role: "user",
        content: "Hello world",
        metadata: {},
        createdAt: new Date().toISOString(),
      });

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/export/search?q=nonexistent&format=json");
      expect(res.status).toBe(200);

      const text = await res.text();
      const parsed = JSON.parse(text) as { meta: { chunkCount: number }; chunks: unknown[] };
      expect(parsed.meta.chunkCount).toBe(0);
      expect(parsed.chunks).toEqual([]);
    });
  });
});
