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

  return api;
}
