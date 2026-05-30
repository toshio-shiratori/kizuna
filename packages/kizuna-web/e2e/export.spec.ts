import { test, expect } from "@playwright/test";

test.describe("Export API", () => {
  test("session export (JSON) returns a download with the seeded chunks", async ({ request }) => {
    const res = await request.get("/api/export/session/e2e-session-1?format=json");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("application/json");
    expect(res.headers()["content-disposition"]).toContain("attachment");

    const body = (await res.json()) as { chunks: { content: string }[] };
    expect(Array.isArray(body.chunks)).toBe(true);
    expect(body.chunks.length).toBeGreaterThanOrEqual(2);
    expect(body.chunks.some((c) => c.content.includes("e2ekeyword"))).toBe(true);
  });

  test("session export (Markdown) returns a markdown body", async ({ request }) => {
    const res = await request.get("/api/export/session/e2e-session-1?format=markdown");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toContain("text/markdown");

    const text = await res.text();
    expect(text).toContain("e2ekeyword");
  });
});
