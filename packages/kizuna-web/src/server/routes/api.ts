import { Hono } from "hono";
import { searchMemory, exportMemory } from "@kizuna/core";
import type { Database, ExportFormat } from "@kizuna/core";
import { discoverReferences } from "@kizuna/plugin-multi-repo-sharing";
import { hasTelepathyTable, sendMessage, receiveMessages } from "@kizuna/plugin-telepathy";
import type { RepoReference } from "@kizuna/plugin-telepathy";
import { runAnalysis } from "../analysis/index.js";

export interface ApiRouteOptions {
  projectDir: string;
  write: boolean;
}

const webLogger = {
  debug() {},
  info() {},
  warn: console.warn,
  error: console.error,
};

export function createApiRoutes(db: Database, options?: ApiRouteOptions): Hono {
  const api = new Hono();

  api.get("/health", (c) => {
    return c.json({ ok: true });
  });

  api.get("/config", (c) => {
    return c.json({ write: options?.write ?? false });
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

  // ─── Chunks ─────────────────────────────────────────

  api.patch("/chunks/:id", async (c) => {
    if (!options?.write) {
      return c.json({ error: "Write mode is not enabled" }, 403);
    }
    const id = Number(c.req.param("id"));
    if (isNaN(id)) {
      return c.json({ error: "Invalid chunk ID" }, 400);
    }
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }
    const { importance } = body;
    if (
      typeof importance !== "number" ||
      importance < 0 ||
      importance > 10 ||
      !Number.isInteger(importance)
    ) {
      return c.json({ error: "importance must be an integer between 0 and 10" }, 400);
    }
    const updated = db.updateChunkImportance(id, importance);
    if (!updated) {
      return c.json({ error: "Chunk not found" }, 404);
    }
    return c.json({ ok: true, id, importance });
  });

  api.delete("/chunks/:id", (c) => {
    if (!options?.write) {
      return c.json({ error: "Write mode is not enabled" }, 403);
    }
    const id = Number(c.req.param("id"));
    if (isNaN(id)) {
      return c.json({ error: "Invalid chunk ID" }, 400);
    }
    const deleted = db.deleteChunks([id]);
    if (deleted === 0) {
      return c.json({ error: "Chunk not found" }, 404);
    }
    return c.json({ ok: true });
  });

  api.get("/analysis", (c) => {
    const project = c.req.query("project");
    if (!project || project.trim().length === 0) {
      return c.json({ error: "Missing required parameter: project" }, 400);
    }
    const report = runAnalysis(db, project.trim());
    return c.json(report);
  });

  // ─── Export ─────────────────────────────────────────────

  api.get("/export/session/:id", async (c) => {
    const sessionId = c.req.param("id");
    const session = db.getSession(sessionId);
    if (!session) {
      return c.json({ error: "Session not found" }, 404);
    }

    const formatParam = c.req.query("format") ?? "json";
    if (formatParam !== "json" && formatParam !== "markdown") {
      return c.json({ error: 'Invalid format: must be "json" or "markdown"' }, 400);
    }
    const format: ExportFormat = formatParam;

    const text = await exportMemory(db, {
      sessionIds: [sessionId],
      format,
      limit: 10_000,
    });

    const shortId = sessionId.slice(0, 8);
    const ext = format === "json" ? "json" : "md";
    const contentType =
      format === "json" ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8";

    return c.body(text, 200, {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="kizuna-session-${shortId}.${ext}"`,
    });
  });

  api.get("/export/search", async (c) => {
    const q = c.req.query("q");
    if (!q || q.trim().length === 0) {
      return c.json({ error: "Missing required parameter: q" }, 400);
    }

    const formatParam = c.req.query("format") ?? "json";
    if (formatParam !== "json" && formatParam !== "markdown") {
      return c.json({ error: 'Invalid format: must be "json" or "markdown"' }, 400);
    }
    const format: ExportFormat = formatParam;

    const limit = Math.min(1000, Math.max(1, Number(c.req.query("limit")) || 100));

    const text = await exportMemory(db, { query: q, format, limit });

    const querySlug = q.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40) || "results";
    const ext = format === "json" ? "json" : "md";
    const contentType =
      format === "json" ? "application/json; charset=utf-8" : "text/markdown; charset=utf-8";

    return c.body(text, 200, {
      "Content-Type": contentType,
      "Content-Disposition": `attachment; filename="kizuna-search-${querySlug}.${ext}"`,
    });
  });

  // ─── Reports ────────────────────────────────────────────

  api.post("/reports", async (c) => {
    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { type, source, title, content } = body;

    if (!type || !source || !title || !content) {
      return c.json({ error: "Missing required fields: type, source, title, content" }, 400);
    }

    if (type !== "analysis" && type !== "proposal") {
      return c.json({ error: 'Invalid type: must be "analysis" or "proposal"' }, 400);
    }

    if (source !== "webui" && source !== "claude") {
      return c.json({ error: 'Invalid source: must be "webui" or "claude"' }, 400);
    }

    if (typeof title !== "string" || typeof content !== "string") {
      return c.json({ error: "title and content must be strings" }, 400);
    }

    const report = db.insertReport({
      type: type as "analysis" | "proposal",
      source: source as "webui" | "claude",
      title,
      content,
    });
    return c.json(report, 201);
  });

  api.get("/reports", (c) => {
    const status = c.req.query("status");
    const type = c.req.query("type");
    const source = c.req.query("source");
    const limit = Math.min(100, Math.max(1, Number(c.req.query("limit")) || 20));
    const offset = Math.max(0, Number(c.req.query("offset")) || 0);

    const { reports, total } = db.listReports({ status, type, source, limit, offset });
    return c.json({ reports, total });
  });

  api.patch("/reports/:id", async (c) => {
    const id = Number(c.req.param("id"));
    if (isNaN(id)) {
      return c.json({ error: "Invalid report ID" }, 400);
    }

    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { status } = body;
    if (status !== "unread" && status !== "read") {
      return c.json({ error: 'Invalid status: must be "unread" or "read"' }, 400);
    }

    const existing = db.getReport(id);
    if (!existing) {
      return c.json({ error: "Report not found" }, 404);
    }

    db.updateReportStatus(id, status as "unread" | "read");
    return c.json({ ...existing, status });
  });

  api.delete("/reports/:id", (c) => {
    const id = Number(c.req.param("id"));
    if (isNaN(id)) {
      return c.json({ error: "Invalid report ID" }, 400);
    }

    const deleted = db.deleteReport(id);
    if (!deleted) {
      return c.json({ error: "Report not found" }, 404);
    }

    return c.json({ ok: true });
  });

  // ─── Telepathy ─────────────────────────────────────────

  api.get("/telepathy/references", (c) => {
    if (!options?.projectDir) {
      return c.json({ references: [] });
    }
    const references = discoverReferences(options.projectDir);
    return c.json({ references });
  });

  api.post("/telepathy/send", async (c) => {
    if (!options?.write) {
      return c.json({ error: "Write mode is not enabled" }, 403);
    }

    if (!hasTelepathyTable(db.db)) {
      return c.json({ error: "Telepathy plugin is not enabled" }, 503);
    }

    let body: Record<string, unknown>;
    try {
      body = (await c.req.json()) as Record<string, unknown>;
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    const { message } = body;
    if (!message || typeof message !== "string") {
      return c.json({ error: "message is required and must be a string" }, 400);
    }

    const MAX_MESSAGE_LENGTH = 100_000;
    if (message.length > MAX_MESSAGE_LENGTH) {
      return c.json(
        { error: `Message too long: ${message.length} chars (max ${MAX_MESSAGE_LENGTH})` },
        400,
      );
    }

    sendMessage(db.db, message);
    return c.json({ ok: true, length: message.length });
  });

  api.get("/telepathy/receive", (c) => {
    if (!options?.projectDir) {
      return c.json({ messages: [], note: "Project directory not configured" });
    }

    const references: RepoReference[] = discoverReferences(options.projectDir);
    if (references.length === 0) {
      return c.json({ messages: [], note: "No referenced projects found" });
    }

    const messages = receiveMessages(references, webLogger);
    return c.json({ messages });
  });

  return api;
}
