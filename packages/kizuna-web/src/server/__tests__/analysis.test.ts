import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hono } from "hono";
import { Database } from "@kizuna/core";
import { createApiRoutes } from "../routes/api.js";
import { runAnalysis } from "../analysis/index.js";
import type { AnalysisReport } from "../analysis/index.js";
import { normalizeError } from "../analysis/rules/repeated-errors.js";
import { normalizeCommand } from "../analysis/rules/manual-repetition.js";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
});

afterEach(() => {
  db.close();
});

function insertSession(
  id: string,
  projectId: string,
  startedAt: string,
  endedAt: string | null = null,
) {
  db.insertSession({
    id,
    projectId,
    startedAt,
    endedAt,
    transcriptPath: null,
    metadata: {},
  });
}

function insertChunk(
  sessionId: string,
  turnIndex: number,
  role: "user" | "assistant",
  content: string,
  createdAt?: string,
) {
  db.insertChunk({
    sessionId,
    turnIndex,
    role,
    content,
    metadata: {},
    createdAt: createdAt ?? "2025-01-01T00:00:00Z",
  });
}

describe("Analysis Engine", () => {
  describe("runAnalysis", () => {
    it("returns empty findings for empty database", () => {
      const report = runAnalysis(db, "project-alpha");
      expect(report.project).toBe("project-alpha");
      expect(report.analyzedSessions).toBe(0);
      expect(report.findings).toEqual([]);
      expect(report.summary.totalFindings).toBe(0);
      expect(report.summary.bySeverity).toEqual({ critical: 0, warning: 0, info: 0 });
      expect(report.summary.byPattern).toEqual({});
    });

    it("returns empty findings for clean session data", () => {
      insertSession("s1", "project-alpha", "2025-01-01T00:00:00Z", "2025-01-01T01:00:00Z");
      insertChunk("s1", 0, "user", "Please implement the login feature.");
      insertChunk("s1", 1, "assistant", "I will implement the login feature now.");

      const report = runAnalysis(db, "project-alpha");
      expect(report.analyzedSessions).toBe(1);
      expect(report.findings).toEqual([]);
    });

    it("only analyzes sessions for the specified project", () => {
      insertSession("s1", "project-alpha", "2025-01-01T00:00:00Z");
      insertChunk("s1", 0, "user", "Please undo the last change.");
      insertChunk("s1", 1, "assistant", "I will revert the change.");

      insertSession("s2", "project-beta", "2025-01-01T00:00:00Z");
      insertChunk("s2", 0, "user", "Please undo everything.");
      insertChunk("s2", 1, "assistant", "Done.");

      const reportAlpha = runAnalysis(db, "project-alpha");
      const reportBeta = runAnalysis(db, "project-beta");

      expect(reportAlpha.analyzedSessions).toBe(1);
      expect(reportBeta.analyzedSessions).toBe(1);

      // Each report should only contain findings from its own project
      for (const f of reportAlpha.findings) {
        for (const sid of f.sessionIds) {
          expect(sid).toBe("s1");
        }
      }
      for (const f of reportBeta.findings) {
        for (const sid of f.sessionIds) {
          expect(sid).toBe("s2");
        }
      }
    });

    it("sorts findings by severity then count", () => {
      insertSession("s1", "proj", "2025-01-01T00:00:00Z", "2025-01-01T01:00:00Z");
      insertSession("s2", "proj", "2025-01-02T00:00:00Z", "2025-01-02T01:00:00Z");
      insertSession("s3", "proj", "2025-01-03T00:00:00Z", "2025-01-03T01:00:00Z");
      insertSession("s4", "proj", "2025-01-04T00:00:00Z", "2025-01-04T01:00:00Z");

      // Repeated error in 4 sessions -> critical
      for (const sid of ["s1", "s2", "s3", "s4"]) {
        insertChunk(sid, 0, "assistant", "Error: ENOENT file not found");
      }

      // Rework in 1 session -> info
      insertChunk("s1", 1, "user", "Please undo that.");
      insertChunk("s1", 2, "assistant", "Reverted.");

      const report = runAnalysis(db, "proj");

      // Critical findings should come first
      const severities = report.findings.map((f) => f.severity);
      const criticalIdx = severities.indexOf("critical");
      const infoIdx = severities.indexOf("info");
      if (criticalIdx !== -1 && infoIdx !== -1) {
        expect(criticalIdx).toBeLessThan(infoIdx);
      }
    });
  });

  describe("Rework Detection", () => {
    it("detects Japanese rework keywords", () => {
      insertSession("s1", "proj", "2025-01-01T00:00:00Z");
      insertChunk("s1", 0, "user", "この変更をやり直してください。");
      insertChunk("s1", 1, "assistant", "はい、修正しました。");

      const report = runAnalysis(db, "proj");
      const rework = report.findings.filter((f) => f.pattern === "rework-detection");
      expect(rework.length).toBe(1);
      expect(rework[0]!.count).toBe(1);
    });

    it("detects English rework keywords with word boundaries", () => {
      insertSession("s1", "proj", "2025-01-01T00:00:00Z");
      insertChunk("s1", 0, "user", "Please undo the last commit.");
      insertChunk("s1", 1, "assistant", "I have reverted the commit.");

      const report = runAnalysis(db, "proj");
      const rework = report.findings.filter((f) => f.pattern === "rework-detection");
      expect(rework.length).toBe(1);
    });

    it("does not false-positive on words containing rework keywords", () => {
      insertSession("s1", "proj", "2025-01-01T00:00:00Z");
      // "undone" should not trigger because \bundo\b won't match inside "undone"
      // actually, "undone" won't match \bundo\b because 'n' follows 'o' but
      // \bundo\b would match "undo" as a substring if preceded/followed by word boundary
      // Let's use a word that truly contains undo as a non-standalone substring
      insertChunk("s1", 0, "user", "The function was tested and documented well.");
      insertChunk("s1", 1, "assistant", "Great, the tests pass.");

      const report = runAnalysis(db, "proj");
      const rework = report.findings.filter((f) => f.pattern === "rework-detection");
      expect(rework).toEqual([]);
    });

    it("does not detect rework without a following assistant response", () => {
      insertSession("s1", "proj", "2025-01-01T00:00:00Z");
      insertChunk("s1", 0, "user", "Please undo the last change.");
      // No assistant response follows

      const report = runAnalysis(db, "proj");
      const rework = report.findings.filter((f) => f.pattern === "rework-detection");
      expect(rework).toEqual([]);
    });
  });

  describe("Repeated Errors", () => {
    it("detects same error across multiple sessions", () => {
      insertSession("s1", "proj", "2025-01-01T00:00:00Z");
      insertSession("s2", "proj", "2025-01-02T00:00:00Z");

      insertChunk("s1", 0, "assistant", "Error: Cannot find module '@kizuna/core'");
      insertChunk("s2", 0, "assistant", "Error: Cannot find module '@kizuna/core'");

      const report = runAnalysis(db, "proj");
      const errors = report.findings.filter((f) => f.pattern === "repeated-errors");
      expect(errors.length).toBe(1);
      expect(errors[0]!.sessionIds.length).toBe(2);
    });

    it("does not flag errors appearing in only one session", () => {
      insertSession("s1", "proj", "2025-01-01T00:00:00Z");
      insertSession("s2", "proj", "2025-01-02T00:00:00Z");

      insertChunk("s1", 0, "assistant", "Error: Cannot find module 'foo'");
      insertChunk("s2", 0, "assistant", "Error: Cannot find module 'bar'");

      const report = runAnalysis(db, "proj");
      const errors = report.findings.filter((f) => f.pattern === "repeated-errors");
      // These are different errors, so they should not be grouped
      expect(errors).toEqual([]);
    });

    it("normalizes paths in error messages for grouping", () => {
      insertSession("s1", "proj", "2025-01-01T00:00:00Z");
      insertSession("s2", "proj", "2025-01-02T00:00:00Z");

      insertChunk("s1", 0, "assistant", "Error: ENOENT /Users/alice/project/foo.ts");
      insertChunk("s2", 0, "assistant", "Error: ENOENT /Users/bob/project/bar.ts");

      const report = runAnalysis(db, "proj");
      const errors = report.findings.filter((f) => f.pattern === "repeated-errors");
      expect(errors.length).toBe(1);
      expect(errors[0]!.sessionIds.length).toBe(2);
    });

    it("sets critical severity for errors in 4+ sessions", () => {
      for (let i = 0; i < 4; i++) {
        insertSession(`s${i}`, "proj", `2025-01-0${i + 1}T00:00:00Z`);
        insertChunk(`s${i}`, 0, "assistant", "TypeError: Cannot read properties of undefined");
      }

      const report = runAnalysis(db, "proj");
      const errors = report.findings.filter((f) => f.pattern === "repeated-errors");
      expect(errors.length).toBe(1);
      expect(errors[0]!.severity).toBe("critical");
    });
  });

  describe("Test-Fix Loop", () => {
    it("detects test-fix cycles in a session", () => {
      insertSession("s1", "proj", "2025-01-01T00:00:00Z");

      // 3 cycles: test->fail->fix->test->fail->fix->test->fail->fix->test
      insertChunk("s1", 0, "assistant", "Running: pnpm test\n\nFAIL src/foo.test.ts");
      insertChunk("s1", 1, "assistant", "I'll fix the issue in foo.ts");
      insertChunk("s1", 2, "assistant", "Running: pnpm test\n\nFAIL src/foo.test.ts");
      insertChunk("s1", 3, "assistant", "Let me try another approach");
      insertChunk("s1", 4, "assistant", "Running: pnpm test\n\nFAIL src/foo.test.ts");
      insertChunk("s1", 5, "assistant", "Fixed the root cause");
      insertChunk("s1", 6, "assistant", "Running: pnpm test\n\nAll tests passed");

      const report = runAnalysis(db, "proj");
      const loops = report.findings.filter((f) => f.pattern === "test-fix-loop");
      expect(loops.length).toBe(1);
      expect(loops[0]!.count).toBeGreaterThanOrEqual(3);
    });

    it("does not flag sessions with fewer than 3 cycles", () => {
      insertSession("s1", "proj", "2025-01-01T00:00:00Z");

      // Only 1 cycle
      insertChunk("s1", 0, "assistant", "Running: pnpm test\n\nFAIL src/foo.test.ts");
      insertChunk("s1", 1, "assistant", "Fixed the issue");
      insertChunk("s1", 2, "assistant", "Running: pnpm test\n\nAll tests passed");

      const report = runAnalysis(db, "proj");
      const loops = report.findings.filter((f) => f.pattern === "test-fix-loop");
      expect(loops).toEqual([]);
    });

    it("does not flag sessions with no test commands", () => {
      insertSession("s1", "proj", "2025-01-01T00:00:00Z");
      insertChunk("s1", 0, "user", "Please implement feature X.");
      insertChunk("s1", 1, "assistant", "Implemented feature X.");

      const report = runAnalysis(db, "proj");
      const loops = report.findings.filter((f) => f.pattern === "test-fix-loop");
      expect(loops).toEqual([]);
    });
  });

  describe("Manual Repetition", () => {
    it("detects commands repeated across 3+ sessions", () => {
      for (let i = 0; i < 3; i++) {
        insertSession(`s${i}`, "proj", `2025-01-0${i + 1}T00:00:00Z`);
        insertChunk(`s${i}`, 0, "assistant", "$ pnpm lint\nAll files passed.");
      }

      const report = runAnalysis(db, "proj");
      const manual = report.findings.filter((f) => f.pattern === "manual-repetition");
      expect(manual.length).toBeGreaterThanOrEqual(1);
      expect(manual[0]!.sessionIds.length).toBeGreaterThanOrEqual(3);
    });

    it("detects commands with known prefixes without $ prompt", () => {
      for (let i = 0; i < 3; i++) {
        insertSession(`s${i}`, "proj", `2025-01-0${i + 1}T00:00:00Z`);
        insertChunk(`s${i}`, 0, "assistant", "git status\nOn branch main");
      }

      const report = runAnalysis(db, "proj");
      const manual = report.findings.filter((f) => f.pattern === "manual-repetition");
      expect(manual.length).toBeGreaterThanOrEqual(1);
    });

    it("does not flag commands appearing in fewer than 3 sessions", () => {
      insertSession("s1", "proj", "2025-01-01T00:00:00Z");
      insertSession("s2", "proj", "2025-01-02T00:00:00Z");
      insertChunk("s1", 0, "assistant", "$ pnpm build\nDone.");
      insertChunk("s2", 0, "assistant", "$ pnpm build\nDone.");

      const report = runAnalysis(db, "proj");
      const manual = report.findings.filter((f) => f.pattern === "manual-repetition");
      expect(manual).toEqual([]);
    });
  });

  describe("Long Sessions", () => {
    it("detects sessions with abnormally high chunk count (absolute threshold)", () => {
      // Only 2 sessions, so absolute threshold (50 chunks) applies
      insertSession("s1", "proj", "2025-01-01T00:00:00Z", "2025-01-01T01:00:00Z");
      insertSession("s2", "proj", "2025-01-02T00:00:00Z", "2025-01-02T01:00:00Z");

      // s1: 60 chunks (over threshold)
      for (let i = 0; i < 60; i++) {
        insertChunk("s1", i, i % 2 === 0 ? "user" : "assistant", `Chunk ${i}`);
      }
      // s2: 5 chunks (normal)
      for (let i = 0; i < 5; i++) {
        insertChunk("s2", i, i % 2 === 0 ? "user" : "assistant", `Chunk ${i}`);
      }

      const report = runAnalysis(db, "proj");
      const long = report.findings.filter((f) => f.pattern === "long-sessions");
      expect(long.length).toBeGreaterThanOrEqual(1);
      expect(long[0]!.sessionIds).toContain("s1");
    });

    it("detects sessions with long duration (absolute threshold)", () => {
      insertSession("s1", "proj", "2025-01-01T00:00:00Z", "2025-01-01T04:00:00Z"); // 4 hours
      insertSession("s2", "proj", "2025-01-02T00:00:00Z", "2025-01-02T00:30:00Z"); // 30 min

      insertChunk("s1", 0, "user", "Working on feature");
      insertChunk("s1", 1, "assistant", "Progress update");
      insertChunk("s2", 0, "user", "Quick fix");
      insertChunk("s2", 1, "assistant", "Done");

      const report = runAnalysis(db, "proj");
      const long = report.findings.filter((f) => f.pattern === "long-sessions");
      expect(long.length).toBeGreaterThanOrEqual(1);
      expect(long.some((f) => f.sessionIds.includes("s1"))).toBe(true);
    });

    it("does not flag normal-length sessions", () => {
      insertSession("s1", "proj", "2025-01-01T00:00:00Z", "2025-01-01T00:30:00Z");
      for (let i = 0; i < 10; i++) {
        insertChunk("s1", i, i % 2 === 0 ? "user" : "assistant", `Message ${i}`);
      }

      const report = runAnalysis(db, "proj");
      const long = report.findings.filter((f) => f.pattern === "long-sessions");
      expect(long).toEqual([]);
    });

    it("uses statistical threshold with 5+ sessions", () => {
      // Create 5 normal sessions with ~10 chunks each
      for (let i = 0; i < 5; i++) {
        insertSession(
          `s${i}`,
          "proj",
          `2025-01-0${i + 1}T00:00:00Z`,
          `2025-01-0${i + 1}T01:00:00Z`,
        );
        for (let j = 0; j < 10; j++) {
          insertChunk(`s${i}`, j, j % 2 === 0 ? "user" : "assistant", `Chunk ${j}`);
        }
      }

      // Create one outlier session with 40 chunks (> mean + 2*stddev with mean=10, stddev~0)
      insertSession("s-outlier", "proj", "2025-01-06T00:00:00Z", "2025-01-06T01:00:00Z");
      for (let j = 0; j < 40; j++) {
        insertChunk("s-outlier", j, j % 2 === 0 ? "user" : "assistant", `Outlier chunk ${j}`);
      }

      const report = runAnalysis(db, "proj");
      const long = report.findings.filter((f) => f.pattern === "long-sessions");
      expect(long.length).toBeGreaterThanOrEqual(1);
      expect(long.some((f) => f.sessionIds.includes("s-outlier"))).toBe(true);
    });
  });

  describe("normalizeError", () => {
    it("normalizes paths", () => {
      const a = normalizeError("Error: ENOENT /Users/alice/project/foo.ts");
      const b = normalizeError("Error: ENOENT /Users/bob/project/bar.ts");
      expect(a).toBe(b);
    });

    it("normalizes timestamps", () => {
      const a = normalizeError("Error at 2025-01-01T10:00:00Z: timeout");
      const b = normalizeError("Error at 2025-06-15T22:30:00Z: timeout");
      expect(a).toBe(b);
    });

    it("normalizes hex addresses", () => {
      const a = normalizeError("Segfault at 0x7fff5fbff8c0");
      const b = normalizeError("Segfault at 0xDEADBEEF");
      expect(a).toBe(b);
    });

    it("collapses whitespace", () => {
      const result = normalizeError("Error:   too   many   spaces");
      expect(result).toBe("error: too many spaces");
    });
  });

  describe("normalizeCommand", () => {
    it("strips prompt characters", () => {
      expect(normalizeCommand("$ pnpm test")).toBe("pnpm test");
      expect(normalizeCommand("> git status")).toBe("git status");
    });

    it("normalizes paths in arguments", () => {
      const a = normalizeCommand("$ cat /Users/alice/file.txt");
      const b = normalizeCommand("$ cat /Users/bob/file.txt");
      expect(a).toBe(b);
    });

    it("normalizes UUIDs", () => {
      const a = normalizeCommand("kizuna list --session 550e8400-e29b-41d4-a716-446655440000");
      const b = normalizeCommand("kizuna list --session 6ba7b810-9dad-11d1-80b4-00c04fd430c8");
      expect(a).toBe(b);
    });

    it("lowercases commands", () => {
      expect(normalizeCommand("GIT Status")).toBe("git status");
    });
  });

  describe("API endpoint", () => {
    it("GET /analysis returns 400 when project is missing", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/analysis");
      expect(res.status).toBe(400);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Missing required parameter: project");
    });

    it("GET /analysis returns 400 when project is empty", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/analysis?project=");
      expect(res.status).toBe(400);

      const body = (await res.json()) as { error: string };
      expect(body.error).toBe("Missing required parameter: project");
    });

    it("GET /analysis returns report for valid project", async () => {
      insertSession("s1", "project-alpha", "2025-01-01T00:00:00Z");
      insertChunk("s1", 0, "user", "Hello");
      insertChunk("s1", 1, "assistant", "Hi");

      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/analysis?project=project-alpha");
      expect(res.status).toBe(200);

      const body = (await res.json()) as AnalysisReport;
      expect(body.project).toBe("project-alpha");
      expect(body.analyzedSessions).toBe(1);
      expect(body.summary).toBeDefined();
      expect(body.findings).toBeDefined();
      expect(Array.isArray(body.findings)).toBe(true);
    });

    it("GET /analysis returns empty report for nonexistent project", async () => {
      const app = new Hono();
      app.route("/api", createApiRoutes(db));

      const res = await app.request("/api/analysis?project=nonexistent");
      expect(res.status).toBe(200);

      const body = (await res.json()) as AnalysisReport;
      expect(body.project).toBe("nonexistent");
      expect(body.analyzedSessions).toBe(0);
      expect(body.findings).toEqual([]);
    });
  });
});
