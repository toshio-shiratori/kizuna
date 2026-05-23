import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { apiRoutes } from "../routes/api.js";

describe("API routes", () => {
  it("GET /health returns { ok: true }", async () => {
    const app = new Hono();
    app.route("/api", apiRoutes);

    const res = await app.request("/api/health");
    expect(res.status).toBe(200);

    const body = (await res.json()) as { ok: boolean };
    expect(body).toEqual({ ok: true });
  });
});
