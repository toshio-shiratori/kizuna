import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "./database.js";
import type { Session, RawChunk } from "../index.js";

function makeTempDb(): { db: Database; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "kizuna-test-"));
  const db = new Database(join(dir, "test.db"));
  return { db, dir };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "sess-1",
    projectId: "proj-1",
    startedAt: new Date().toISOString(),
    endedAt: null,
    transcriptPath: null,
    metadata: {},
    ...overrides,
  };
}

function makeChunk(overrides: Partial<RawChunk> = {}): RawChunk {
  return {
    sessionId: "sess-1",
    turnIndex: 0,
    role: "user",
    content: "hello world",
    metadata: {},
    ...overrides,
  };
}

describe("Database", () => {
  let db: Database;
  let dir: string;

  beforeEach(() => {
    ({ db, dir } = makeTempDb());
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  describe("sessions", () => {
    it("inserts and retrieves a session", () => {
      const session = makeSession();
      db.insertSession(session);
      const got = db.getSession("sess-1");
      expect(got).toEqual(session);
    });

    it("returns null for missing session", () => {
      expect(db.getSession("nonexistent")).toBeNull();
    });

    it("returns the latest session by started_at", () => {
      db.insertSession(makeSession({ id: "old", startedAt: "2025-01-01T00:00:00Z" }));
      db.insertSession(makeSession({ id: "new", startedAt: "2025-06-01T00:00:00Z" }));
      const latest = db.getLatestSession();
      expect(latest).not.toBeNull();
      expect(latest!.id).toBe("new");
    });

    it("returns null when no sessions exist", () => {
      expect(db.getLatestSession()).toBeNull();
    });

    it("returns the latest session that has chunks", () => {
      db.insertSession(makeSession({ id: "with-chunks", startedAt: "2025-01-01T00:00:00Z" }));
      db.insertSession(makeSession({ id: "empty-newer", startedAt: "2025-06-01T00:00:00Z" }));
      db.insertChunk(makeChunk({ sessionId: "with-chunks" }));
      const latest = db.getLatestSessionWithChunks();
      expect(latest).not.toBeNull();
      expect(latest!.id).toBe("with-chunks");
    });

    it("returns null when no sessions have chunks", () => {
      db.insertSession(makeSession({ id: "empty" }));
      expect(db.getLatestSessionWithChunks()).toBeNull();
    });

    it("lists sessions with preview", () => {
      db.insertSession(
        makeSession({ id: "s1", projectId: "proj-a", startedAt: "2025-01-01T00:00:00Z" }),
      );
      db.insertSession(
        makeSession({ id: "s2", projectId: "proj-b", startedAt: "2025-02-01T00:00:00Z" }),
      );
      db.insertSession(
        makeSession({ id: "s3-empty", projectId: "proj-c", startedAt: "2025-03-01T00:00:00Z" }),
      );

      db.insertChunk({
        ...makeChunk({ sessionId: "s1", turnIndex: 0, content: "First line of s1\nSecond line" }),
        createdAt: "2025-01-01T00:01:00Z",
      });
      db.insertChunk({
        ...makeChunk({ sessionId: "s1", turnIndex: 1, content: "Later chunk" }),
        createdAt: "2025-01-01T00:02:00Z",
      });
      db.insertChunk({
        ...makeChunk({ sessionId: "s2", turnIndex: 0, content: "Only chunk in s2" }),
        createdAt: "2025-02-01T00:01:00Z",
      });

      const previews = db.listSessionsWithPreview();
      expect(previews).toHaveLength(2);
      expect(previews[0]!.sessionId).toBe("s2");
      expect(previews[0]!.projectId).toBe("proj-b");
      expect(previews[0]!.preview).toBe("Only chunk in s2");
      expect(previews[1]!.sessionId).toBe("s1");
      expect(previews[1]!.preview).toBe("First line of s1");
    });

    it("listSessionsWithPreview respects limit", () => {
      for (let i = 0; i < 5; i++) {
        const id = `lim-${i}`;
        db.insertSession(makeSession({ id, startedAt: `2025-0${i + 1}-01T00:00:00Z` }));
        db.insertChunk(makeChunk({ sessionId: id, turnIndex: 0, content: `Content ${i}` }));
      }
      const previews = db.listSessionsWithPreview(2);
      expect(previews).toHaveLength(2);
      expect(previews[0]!.sessionId).toBe("lim-4");
      expect(previews[1]!.sessionId).toBe("lim-3");
    });

    it("listSessionsWithPreview returns empty when no sessions have chunks", () => {
      db.insertSession(makeSession({ id: "empty-only" }));
      const previews = db.listSessionsWithPreview();
      expect(previews).toHaveLength(0);
    });

    it("stores metadata as JSON", () => {
      const session = makeSession({ metadata: { tool: "claude", count: 42 } });
      db.insertSession(session);
      const got = db.getSession("sess-1")!;
      expect(got.metadata).toEqual({ tool: "claude", count: 42 });
    });
  });

  describe("chunks", () => {
    beforeEach(() => {
      db.insertSession(makeSession());
    });

    it("inserts and retrieves a chunk", () => {
      const stored = db.insertChunk(makeChunk());
      expect(stored.id).toBeGreaterThan(0);
      expect(stored.content).toBe("hello world");
      expect(stored.tokenCount).toBe(0);
      expect(stored.importance).toBe(5);

      const got = db.getChunk(stored.id);
      expect(got).toEqual(stored);
    });

    it("returns null for missing chunk", () => {
      expect(db.getChunk(999)).toBeNull();
    });

    it("retrieves chunks by session ordered by turn index", () => {
      db.insertChunk(makeChunk({ turnIndex: 2, content: "third" }));
      db.insertChunk(makeChunk({ turnIndex: 0, content: "first" }));
      db.insertChunk(makeChunk({ turnIndex: 1, content: "second" }));

      const chunks = db.getChunksBySession("sess-1");
      expect(chunks).toHaveLength(3);
      expect(chunks.map((c) => c.content)).toEqual(["first", "second", "third"]);
    });

    it("respects custom tokenCount and importance", () => {
      const stored = db.insertChunk(makeChunk({ content: "important" }));
      expect(stored.tokenCount).toBe(0);
      expect(stored.importance).toBe(5);

      const stored2 = db.insertChunk({
        ...makeChunk({ content: "custom" }),
        tokenCount: 150,
        importance: 9,
      });
      expect(stored2.tokenCount).toBe(150);
      expect(stored2.importance).toBe(9);
    });

    it("updates chunk importance", () => {
      const stored = db.insertChunk(makeChunk());
      expect(stored.importance).toBe(5);

      const updated = db.updateChunkImportance(stored.id, 8);
      expect(updated).toBe(true);

      const got = db.getChunk(stored.id);
      expect(got!.importance).toBe(8);
    });

    it("updateChunkImportance returns false for non-existent chunk", () => {
      expect(db.updateChunkImportance(99999, 5)).toBe(false);
    });

    it("deletes chunks by id", () => {
      const c1 = db.insertChunk(makeChunk({ turnIndex: 0 }));
      const c2 = db.insertChunk(makeChunk({ turnIndex: 1 }));
      const c3 = db.insertChunk(makeChunk({ turnIndex: 2 }));

      const deleted = db.deleteChunks([c1.id, c3.id]);
      expect(deleted).toBe(2);
      expect(db.getChunk(c1.id)).toBeNull();
      expect(db.getChunk(c2.id)).not.toBeNull();
      expect(db.getChunk(c3.id)).toBeNull();
    });

    it("deleteChunks returns 0 for empty array", () => {
      expect(db.deleteChunks([])).toBe(0);
    });

    it("deletes chunks before a date", () => {
      db.insertChunk({
        ...makeChunk({ turnIndex: 0, content: "old" }),
        createdAt: "2024-01-01T00:00:00.000Z",
      });
      db.insertChunk({
        ...makeChunk({ turnIndex: 1, content: "new" }),
        createdAt: "2025-06-01T00:00:00.000Z",
      });

      const deleted = db.deleteChunksBefore("2025-01-01T00:00:00.000Z");
      expect(deleted).toBe(1);
      const remaining = db.getChunksBySession("sess-1");
      expect(remaining).toHaveLength(1);
      expect(remaining[0]!.content).toBe("new");
    });
  });

  describe("search", () => {
    beforeEach(() => {
      db.insertSession(makeSession());
      db.insertChunk(
        makeChunk({ turnIndex: 0, content: "TypeScript is a typed superset of JavaScript" }),
      );
      db.insertChunk(
        makeChunk({ turnIndex: 1, content: "Python is a dynamic programming language" }),
      );
      db.insertChunk(makeChunk({ turnIndex: 2, content: "日本語のテキストも検索できます" }));
    });

    it("finds chunks matching a query", () => {
      const results = db.searchChunks("TypeScript");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.chunk.content).toContain("TypeScript");
      expect(results[0]!.score).toBeGreaterThan(0);
    });

    it("finds Japanese text with trigram tokenizer", () => {
      const results = db.searchChunks("日本語");
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.chunk.content).toContain("日本語");
    });

    it("respects limit parameter", () => {
      const results = db.searchChunks("a", 1);
      expect(results.length).toBeLessThanOrEqual(1);
    });

    it("returns empty for no matches", () => {
      const results = db.searchChunks("xyznonexistent123");
      expect(results).toHaveLength(0);
    });

    it("factors importance into score", () => {
      db.insertChunk({
        ...makeChunk({ turnIndex: 3, content: "important TypeScript guide" }),
        importance: 10,
      });
      db.insertChunk({
        ...makeChunk({ turnIndex: 4, content: "low priority TypeScript note" }),
        importance: 1,
      });

      const results = db.searchChunks("TypeScript");
      const importantResult = results.find((r) => r.chunk.content.includes("important"));
      const lowResult = results.find((r) => r.chunk.content.includes("low priority"));
      if (importantResult && lowResult) {
        expect(importantResult.score).toBeGreaterThan(lowResult.score);
      }
    });
  });

  describe("maintenance", () => {
    it("records and retrieves maintenance runs", () => {
      db.insertMaintenanceRun({
        chunksDeleted: 10,
        sessionsDeleted: 2,
        bytesReclaimed: 4096,
        durationMs: 150,
      });

      const last = db.getLastMaintenanceRun();
      expect(last).not.toBeNull();
      expect(last!.chunksDeleted).toBe(10);
      expect(last!.sessionsDeleted).toBe(2);
      expect(last!.bytesReclaimed).toBe(4096);
      expect(last!.durationMs).toBe(150);
    });

    it("returns null when no maintenance runs exist", () => {
      expect(db.getLastMaintenanceRun()).toBeNull();
    });

    it("deletes empty sessions", () => {
      db.insertSession(makeSession({ id: "empty-1" }));
      db.insertSession(makeSession({ id: "has-chunks" }));
      db.insertChunk(makeChunk({ sessionId: "has-chunks" }));

      const deleted = db.deleteEmptySessions();
      expect(deleted).toBe(1);
      expect(db.getSession("empty-1")).toBeNull();
      expect(db.getSession("has-chunks")).not.toBeNull();
    });
  });

  describe("database info", () => {
    it("reports database size", () => {
      const size = db.getDatabaseSizeBytes();
      expect(size).toBeGreaterThan(0);
    });

    it("runs WAL checkpoint without error", () => {
      expect(() => db.walCheckpoint()).not.toThrow();
    });
  });

  describe("getStats", () => {
    it("returns zeros for an empty database", () => {
      const stats = db.getStats();
      expect(stats.databaseSizeBytes).toBeGreaterThan(0);
      expect(stats.sessionCount).toBe(0);
      expect(stats.chunkCount).toBe(0);
      expect(stats.oldestChunkDate).toBeNull();
      expect(stats.newestChunkDate).toBeNull();
      expect(stats.lastMaintenanceAt).toBeNull();
      expect(stats.projectDistribution).toEqual([]);
    });

    it("returns correct stats with data", () => {
      db.insertSession(makeSession({ id: "s1", projectId: "proj-a" }));
      db.insertChunk({
        ...makeChunk({ sessionId: "s1", turnIndex: 0 }),
        createdAt: "2025-01-01T00:00:00Z",
      });
      db.insertChunk({
        ...makeChunk({ sessionId: "s1", turnIndex: 1 }),
        createdAt: "2025-06-01T00:00:00Z",
      });

      db.insertSession(makeSession({ id: "s2", projectId: "proj-b" }));
      db.insertChunk({
        ...makeChunk({ sessionId: "s2", turnIndex: 0 }),
        createdAt: "2025-03-01T00:00:00Z",
      });

      db.insertMaintenanceRun(
        { chunksDeleted: 0, sessionsDeleted: 0, bytesReclaimed: 0, durationMs: 10 },
        "2025-04-01T00:00:00Z",
      );

      const stats = db.getStats();
      expect(stats.sessionCount).toBe(2);
      expect(stats.chunkCount).toBe(3);
      expect(stats.oldestChunkDate).toBe("2025-01-01T00:00:00Z");
      expect(stats.newestChunkDate).toBe("2025-06-01T00:00:00Z");
      expect(stats.lastMaintenanceAt).toBe("2025-04-01T00:00:00Z");
      expect(stats.projectDistribution).toEqual([
        { projectId: "proj-a", chunkCount: 2 },
        { projectId: "proj-b", chunkCount: 1 },
      ]);
    });
  });

  describe("reports", () => {
    it("inserts and retrieves a report", () => {
      const report = db.insertReport({
        type: "analysis",
        source: "webui",
        title: "Test Report",
        content: "Some analysis content",
      });
      expect(report.id).toBeGreaterThan(0);
      expect(report.type).toBe("analysis");
      expect(report.source).toBe("webui");
      expect(report.title).toBe("Test Report");
      expect(report.content).toBe("Some analysis content");
      expect(report.status).toBe("unread");
      expect(report.createdAt).toBeTruthy();

      const got = db.getReport(report.id);
      expect(got).toEqual(report);
    });

    it("returns null for non-existent report", () => {
      expect(db.getReport(99999)).toBeNull();
    });

    it("lists reports with filtering by status", () => {
      db.insertReport({
        type: "analysis",
        source: "webui",
        title: "Unread Report",
        content: "content",
      });
      const r2 = db.insertReport({
        type: "proposal",
        source: "claude",
        title: "Read Report",
        content: "content",
      });
      db.updateReportStatus(r2.id, "read");

      const { reports: unread, total: unreadTotal } = db.listReports({ status: "unread" });
      expect(unreadTotal).toBe(1);
      expect(unread).toHaveLength(1);
      expect(unread[0]!.title).toBe("Unread Report");

      const { reports: read, total: readTotal } = db.listReports({ status: "read" });
      expect(readTotal).toBe(1);
      expect(read).toHaveLength(1);
      expect(read[0]!.title).toBe("Read Report");
    });

    it("lists reports with filtering by type", () => {
      db.insertReport({
        type: "analysis",
        source: "webui",
        title: "Analysis",
        content: "content",
      });
      db.insertReport({
        type: "proposal",
        source: "claude",
        title: "Proposal",
        content: "content",
      });

      const { reports, total } = db.listReports({ type: "proposal" });
      expect(total).toBe(1);
      expect(reports).toHaveLength(1);
      expect(reports[0]!.title).toBe("Proposal");
    });

    it("lists reports with filtering by source", () => {
      db.insertReport({
        type: "analysis",
        source: "webui",
        title: "From WebUI",
        content: "content",
      });
      db.insertReport({
        type: "proposal",
        source: "claude",
        title: "From Claude",
        content: "content",
      });

      const { reports, total } = db.listReports({ source: "claude" });
      expect(total).toBe(1);
      expect(reports).toHaveLength(1);
      expect(reports[0]!.title).toBe("From Claude");
    });

    it("lists all reports without filters", () => {
      db.insertReport({
        type: "analysis",
        source: "webui",
        title: "Report 1",
        content: "content",
      });
      db.insertReport({
        type: "proposal",
        source: "claude",
        title: "Report 2",
        content: "content",
      });

      const { reports, total } = db.listReports();
      expect(total).toBe(2);
      expect(reports).toHaveLength(2);
    });

    it("updates report status", () => {
      const report = db.insertReport({
        type: "analysis",
        source: "webui",
        title: "Test",
        content: "content",
      });
      expect(report.status).toBe("unread");

      const updated = db.updateReportStatus(report.id, "read");
      expect(updated).toBe(true);

      const got = db.getReport(report.id);
      expect(got!.status).toBe("read");
    });

    it("updateReportStatus returns false for non-existent report", () => {
      expect(db.updateReportStatus(99999, "read")).toBe(false);
    });

    it("deletes a report", () => {
      const report = db.insertReport({
        type: "analysis",
        source: "webui",
        title: "To Delete",
        content: "content",
      });

      const deleted = db.deleteReport(report.id);
      expect(deleted).toBe(true);
      expect(db.getReport(report.id)).toBeNull();
    });

    it("deleteReport returns false for non-existent report", () => {
      expect(db.deleteReport(99999)).toBe(false);
    });
  });

  describe("migrations", () => {
    it("is idempotent — opening twice doesn't fail", () => {
      const dbPath = join(dir, "test.db");
      db.close();
      const db2 = new Database(dbPath);
      db2.close();
      db = new Database(dbPath);
    });
  });
});
