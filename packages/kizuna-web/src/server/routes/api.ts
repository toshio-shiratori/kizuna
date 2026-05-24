import { Hono } from "hono";
import { searchMemory } from "@kizuna/core";
import type { Database } from "@kizuna/core";
import { runAnalysis } from "../analysis/index.js";

export function createApiRoutes(db: Database): Hono {
  const api = new Hono();

  api.get("/health", (c) => {
    return c.json({ ok: true });
  });

  api.get("/stats", (c) => {
    return c.json(db.getStats());
  });

  api.get("/sessions", (c) => {
    const page = Math.max(1, Number(c.req.query("page")) || 1);
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 20));
    const offset = (page - 1) * limit;
    const { sessions, total } = db.listSessionsPaginated(offset, limit);
    const totalPages = Math.ceil(total / limit);
    return c.json({ items: sessions, total, page, limit, totalPages });
  });

  api.get("/search", async (c) => {
    const q = c.req.query("q");
    if (!q || q.trim().length === 0) {
      return c.json({ error: "Missing required parameter: q" }, 400);
    }
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 20));
    const results = await searchMemory(db, { text: q, limit });
    return c.json({ results, query: q });
  });

  api.get("/sessions/:id/chunks", (c) => {
    const sessionId = c.req.param("id");
    const session = db.getSession(sessionId);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }
    const chunks = db.getChunksBySession(sessionId);
    return c.json({ session, chunks });
  });

  api.get("/analysis", (c) => {
    const project = c.req.query("project");
    if (!project || project.trim().length === 0) {
      return c.json({ error: "Missing required parameter: project" }, 400);
    }
    const report = runAnalysis(db, project.trim());
    return c.json(report);
  });

  return api;
}
