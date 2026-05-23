import { Hono } from "hono";

export const apiRoutes = new Hono();

apiRoutes.get("/health", (c) => {
  return c.json({ ok: true });
});
