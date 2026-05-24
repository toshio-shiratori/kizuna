import { Hono } from "hono";
import type { Database } from "@kizuna/core";

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

  api.get("/sessions/:id/chunks", (c) => {
    const sessionId = c.req.param("id");
    const session = db.getSession(sessionId);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }
    const chunks = db.getChunksBySession(sessionId);
    return c.json({ session, chunks });
  });

  return api;
}
