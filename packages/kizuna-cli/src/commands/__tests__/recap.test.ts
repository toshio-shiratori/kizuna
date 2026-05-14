import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "@kizuna/core";
import { runCli, seedDatabase, createTempDir, removeTempDir } from "../../test-utils.js";

describe("recap command", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  it("should show the latest session chunks", () => {
    const db = seedDatabase(tempDir);
    db.close();

    const result = runCli(`recap --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("## Session:");
    expect(result.stdout).toContain("(project: test-project)");
    expect(result.stdout).toContain("**assistant**:");
    expect(result.stdout).toContain("SQLite");
  });

  it("should support --project option for cross-project sharing", () => {
    const otherDir = mkdtempSync(join(tmpdir(), "kizuna-cli-test-other-"));
    try {
      const db = seedDatabase(otherDir);
      db.close();

      const result = runCli(`recap --project ${otherDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("## Session:");
      expect(result.stdout).toContain("test-project");
    } finally {
      rmSync(otherDir, { recursive: true, force: true });
    }
  });

  it("should report when no database exists", () => {
    const result = runCli(`recap --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("No Kizuna database found");
  });

  it("should report when no sessions with chunks exist", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    const db = new Database(join(kizunaDir, "memory.db"));
    db.insertSession({
      id: "empty-session",
      projectId: "test",
      startedAt: new Date().toISOString(),
      endedAt: null,
      transcriptPath: null,
      metadata: {},
    });
    db.close();

    const result = runCli(`recap --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No sessions with chunks found");
  });

  it("should skip empty sessions and show the one with chunks", () => {
    const db = seedDatabase(tempDir);
    db.insertSession({
      id: "empty-newer",
      projectId: "test-project",
      startedAt: "2099-01-01T00:00:00Z",
      endedAt: null,
      transcriptPath: null,
      metadata: {},
    });
    db.close();

    const result = runCli(`recap --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("**assistant**:");
    expect(result.stdout).toContain("SQLite");
  });

  it("should limit output with --limit option", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    const db = new Database(join(kizunaDir, "memory.db"));
    db.insertSession({
      id: "multi-chunk",
      projectId: "test",
      startedAt: "2025-01-01T00:00:00Z",
      endedAt: null,
      transcriptPath: null,
      metadata: {},
    });
    for (let i = 0; i < 5; i++) {
      db.insertChunk({
        sessionId: "multi-chunk",
        turnIndex: i,
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Message number ${i}`,
        metadata: {},
      });
    }
    db.close();

    const result = runCli(`recap --limit 2 --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Message number 3");
    expect(result.stdout).toContain("Message number 4");
    expect(result.stdout).not.toContain("Message number 0");
  });

  it("should apply default limit of 5 chunks", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    const db = new Database(join(kizunaDir, "memory.db"));
    db.insertSession({
      id: "many-chunks",
      projectId: "test",
      startedAt: "2025-01-01T00:00:00Z",
      endedAt: null,
      transcriptPath: null,
      metadata: {},
    });
    for (let i = 0; i < 10; i++) {
      db.insertChunk({
        sessionId: "many-chunks",
        turnIndex: i,
        role: i % 2 === 0 ? "user" : "assistant",
        content: `Chunk content ${i}`,
        metadata: {},
      });
    }
    db.close();

    const result = runCli(`recap --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Chunk content 5");
    expect(result.stdout).toContain("Chunk content 9");
    expect(result.stdout).not.toContain("Chunk content 4");
  });

  it("should show all chunks with --no-limit", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    const db = new Database(join(kizunaDir, "memory.db"));
    db.insertSession({
      id: "all-chunks",
      projectId: "test",
      startedAt: "2025-01-01T00:00:00Z",
      endedAt: null,
      transcriptPath: null,
      metadata: {},
    });
    for (let i = 0; i < 10; i++) {
      db.insertChunk({
        sessionId: "all-chunks",
        turnIndex: i,
        role: i % 2 === 0 ? "user" : "assistant",
        content: `All chunk ${i}`,
        metadata: {},
      });
    }
    db.close();

    const result = runCli(`recap --no-limit --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("All chunk 0");
    expect(result.stdout).toContain("All chunk 9");
  });

  it("should show multiple sessions with --sessions option", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    const db = new Database(join(kizunaDir, "memory.db"));
    db.insertSession({
      id: "session-old",
      projectId: "test",
      startedAt: "2025-01-01T00:00:00Z",
      endedAt: null,
      transcriptPath: null,
      metadata: {},
    });
    db.insertSession({
      id: "session-new",
      projectId: "test",
      startedAt: "2025-01-02T00:00:00Z",
      endedAt: null,
      transcriptPath: null,
      metadata: {},
    });
    db.insertChunk({
      sessionId: "session-old",
      turnIndex: 0,
      role: "user",
      content: "Old session content here",
      metadata: {},
    });
    db.insertChunk({
      sessionId: "session-new",
      turnIndex: 0,
      role: "user",
      content: "New session content here",
      metadata: {},
    });
    db.close();

    const result = runCli(`recap --sessions 2 --no-limit --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Old session content here");
    expect(result.stdout).toContain("New session content here");
  });

  it("should show specific session with --session option", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    const db = new Database(join(kizunaDir, "memory.db"));
    db.insertSession({
      id: "target-session",
      projectId: "test",
      startedAt: "2025-01-01T00:00:00Z",
      endedAt: null,
      transcriptPath: null,
      metadata: {},
    });
    db.insertChunk({
      sessionId: "target-session",
      turnIndex: 0,
      role: "assistant",
      content: "Target session specific content",
      metadata: {},
    });
    db.close();

    const result = runCli(`recap --session target-session --no-limit --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Target session specific content");
  });

  it("should list sessions with --list option", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    const db = new Database(join(kizunaDir, "memory.db"));
    db.insertSession({
      id: "list-sess-1",
      projectId: "proj-a",
      startedAt: "2025-01-01T10:00:00Z",
      endedAt: null,
      transcriptPath: null,
      metadata: {},
    });
    db.insertSession({
      id: "list-sess-2",
      projectId: "proj-b",
      startedAt: "2025-02-01T08:30:00Z",
      endedAt: null,
      transcriptPath: null,
      metadata: {},
    });
    db.insertChunk({
      sessionId: "list-sess-1",
      turnIndex: 0,
      role: "user",
      content: "Session one first chunk",
      metadata: {},
    });
    db.insertChunk({
      sessionId: "list-sess-2",
      turnIndex: 0,
      role: "user",
      content: "Session two first chunk",
      metadata: {},
    });
    db.close();

    const result = runCli(`recap --list --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Sessions with chunks:");
    expect(result.stdout).toContain("proj-b");
    expect(result.stdout).toContain("Session two first chunk");
    expect(result.stdout).toContain("proj-a");
    expect(result.stdout).toContain("Session one first chunk");
  });

  it("should show no sessions message with --list when empty", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    const db = new Database(join(kizunaDir, "memory.db"));
    db.close();

    const result = runCli(`recap --list --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No sessions with chunks found");
  });

  it("should support --list with --project option", () => {
    const otherDir = mkdtempSync(join(tmpdir(), "kizuna-cli-test-list-"));
    try {
      const kizunaDir = join(otherDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.insertSession({
        id: "cross-list-sess",
        projectId: "other-proj",
        startedAt: "2025-03-01T12:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      db.insertChunk({
        sessionId: "cross-list-sess",
        turnIndex: 0,
        role: "user",
        content: "Cross project content",
        metadata: {},
      });
      db.close();

      const result = runCli(`recap --list --project ${otherDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("other-proj");
      expect(result.stdout).toContain("Cross project content");
    } finally {
      rmSync(otherDir, { recursive: true, force: true });
    }
  });

  it("should report error for non-existent session ID", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    const db = new Database(join(kizunaDir, "memory.db"));
    db.close();

    const result = runCli(`recap --session nonexistent --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Session not found");
  });

  describe("--session prefix match", () => {
    it("should match session by ID prefix", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.insertSession({
        id: "abc-def-123",
        projectId: "test",
        startedAt: "2025-06-01T10:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      db.insertChunk({
        sessionId: "abc-def-123",
        turnIndex: 0,
        role: "user",
        content: "Prefix match content",
        metadata: {},
      });
      db.close();

      const result = runCli(`recap --session abc-def --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Prefix match content");
    });

    it("should show candidates when multiple sessions match prefix", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.insertSession({
        id: "abc-111",
        projectId: "test",
        startedAt: "2025-06-01T10:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      db.insertSession({
        id: "abc-222",
        projectId: "test",
        startedAt: "2025-06-02T10:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      db.insertChunk({
        sessionId: "abc-111",
        turnIndex: 0,
        role: "user",
        content: "First match",
        metadata: {},
      });
      db.insertChunk({
        sessionId: "abc-222",
        turnIndex: 0,
        role: "user",
        content: "Second match",
        metadata: {},
      });
      db.close();

      const result = runCli(`recap --session abc --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Multiple sessions match prefix "abc"');
      expect(result.stdout).toContain("abc-111");
      expect(result.stdout).toContain("abc-222");
      expect(result.stdout).toContain("Specify a longer prefix");
    });

    it("should report not found when prefix matches nothing", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.close();

      const result = runCli(`recap --session zzz --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("Session not found");
    });
  });

  describe("--date option", () => {
    it("should show sessions for a specific date", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.insertSession({
        id: "date-session-1",
        projectId: "test",
        startedAt: "2025-03-15T09:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      db.insertChunk({
        sessionId: "date-session-1",
        turnIndex: 0,
        role: "user",
        content: "Date filtered content",
        metadata: {},
      });
      db.close();

      const result = runCli(`recap --date 2025-03-15 --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Date filtered content");
    });

    it("should show multiple sessions on the same date", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.insertSession({
        id: "date-multi-1",
        projectId: "test",
        startedAt: "2025-04-10T09:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      db.insertSession({
        id: "date-multi-2",
        projectId: "test",
        startedAt: "2025-04-10T14:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      db.insertChunk({
        sessionId: "date-multi-1",
        turnIndex: 0,
        role: "user",
        content: "Morning session",
        metadata: {},
      });
      db.insertChunk({
        sessionId: "date-multi-2",
        turnIndex: 0,
        role: "user",
        content: "Afternoon session",
        metadata: {},
      });
      db.close();

      const result = runCli(`recap --date 2025-04-10 --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Sessions on 2025-04-10:");
      expect(result.stdout).toContain("date-multi-1");
      expect(result.stdout).toContain("date-multi-2");
    });

    it("should report no sessions when date has none", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.close();

      const result = runCli(`recap --date 2099-12-31 --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("No sessions with chunks found for 2099-12-31");
    });

    it("should reject invalid date format", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.close();

      const result = runCli(`recap --date 2025/03/15 --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("Invalid date format");
    });

    it("should reject semantically invalid date", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.close();

      const result = runCli(`recap --date 2025-02-30 --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("Invalid date format");
    });
  });

  describe("--last option", () => {
    it("should show the Nth most recent session", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.insertSession({
        id: "last-old",
        projectId: "test",
        startedAt: "2025-01-01T00:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      db.insertSession({
        id: "last-new",
        projectId: "test",
        startedAt: "2025-01-02T00:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      db.insertChunk({
        sessionId: "last-old",
        turnIndex: 0,
        role: "user",
        content: "Older session content",
        metadata: {},
      });
      db.insertChunk({
        sessionId: "last-new",
        turnIndex: 0,
        role: "user",
        content: "Newer session content",
        metadata: {},
      });
      db.close();

      // --last 1 should show the most recent
      const result1 = runCli(`recap --last 1 --no-limit --cwd ${tempDir}`, tempDir);
      expect(result1.exitCode).toBe(0);
      expect(result1.stdout).toContain("Newer session content");
      expect(result1.stdout).not.toContain("Older session content");

      // --last 2 should show the second most recent
      const result2 = runCli(`recap --last 2 --no-limit --cwd ${tempDir}`, tempDir);
      expect(result2.exitCode).toBe(0);
      expect(result2.stdout).toContain("Older session content");
      expect(result2.stdout).not.toContain("Newer session content");
    });

    it("should report error when N exceeds available sessions", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.insertSession({
        id: "only-session",
        projectId: "test",
        startedAt: "2025-01-01T00:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      db.insertChunk({
        sessionId: "only-session",
        turnIndex: 0,
        role: "user",
        content: "Only content",
        metadata: {},
      });
      db.close();

      const result = runCli(`recap --last 5 --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("Only 1 session(s) with chunks available");
    });

    it("should reject invalid --last value", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.close();

      const result = runCli(`recap --last abc --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("--last must be a positive integer");
    });
  });

  describe("truncation", () => {
    it("should truncate long assistant content by default", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.insertSession({
        id: "trunc-session",
        projectId: "test",
        startedAt: "2025-01-01T00:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      // Create content that exceeds default 500 chars
      const longContent = "A".repeat(800);
      db.insertChunk({
        sessionId: "trunc-session",
        turnIndex: 0,
        role: "assistant",
        content: longContent,
        metadata: {},
      });
      db.close();

      const result = runCli(`recap --session trunc-session --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("... (truncated, 800 chars total)");
      expect(result.stdout).not.toContain("A".repeat(800));
    });

    it("should not truncate short assistant content", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.insertSession({
        id: "short-session",
        projectId: "test",
        startedAt: "2025-01-01T00:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      db.insertChunk({
        sessionId: "short-session",
        turnIndex: 0,
        role: "assistant",
        content: "Short response",
        metadata: {},
      });
      db.close();

      const result = runCli(`recap --session short-session --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Short response");
      expect(result.stdout).not.toContain("truncated");
    });

    it("should not truncate user content regardless of length", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.insertSession({
        id: "user-long-session",
        projectId: "test",
        startedAt: "2025-01-01T00:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      const longUserContent = "U".repeat(800);
      db.insertChunk({
        sessionId: "user-long-session",
        turnIndex: 0,
        role: "user",
        content: longUserContent,
        metadata: {},
      });
      db.close();

      const result = runCli(`recap --session user-long-session --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(longUserContent);
      expect(result.stdout).not.toContain("truncated");
    });

    it("should show full content with --verbose", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.insertSession({
        id: "verbose-session",
        projectId: "test",
        startedAt: "2025-01-01T00:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      const longContent = "V".repeat(800);
      db.insertChunk({
        sessionId: "verbose-session",
        turnIndex: 0,
        role: "assistant",
        content: longContent,
        metadata: {},
      });
      db.close();

      const result = runCli(`recap --session verbose-session --verbose --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(longContent);
      expect(result.stdout).not.toContain("truncated");
    });

    it("should show full content with -v shorthand", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      const db = new Database(join(kizunaDir, "memory.db"));
      db.insertSession({
        id: "v-session",
        projectId: "test",
        startedAt: "2025-01-01T00:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      const longContent = "X".repeat(800);
      db.insertChunk({
        sessionId: "v-session",
        turnIndex: 0,
        role: "assistant",
        content: longContent,
        metadata: {},
      });
      db.close();

      const result = runCli(`recap --session v-session -v --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain(longContent);
      expect(result.stdout).not.toContain("truncated");
    });

    it("should respect custom recapMaxContentLength config", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      // Write custom config with small max length
      writeFileSync(
        join(kizunaDir, "config.json"),
        JSON.stringify({ display: { recapMaxContentLength: 50 } }),
      );
      const db = new Database(join(kizunaDir, "memory.db"));
      db.insertSession({
        id: "config-session",
        projectId: "test",
        startedAt: "2025-01-01T00:00:00Z",
        endedAt: null,
        transcriptPath: null,
        metadata: {},
      });
      // Content of exactly 100 chars should be truncated at 50
      const content = "C".repeat(100);
      db.insertChunk({
        sessionId: "config-session",
        turnIndex: 0,
        role: "assistant",
        content: content,
        metadata: {},
      });
      db.close();

      const result = runCli(`recap --session config-session --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("... (truncated, 100 chars total)");
      expect(result.stdout).not.toContain("C".repeat(100));
      // Should contain exactly 50 C's followed by truncation
      expect(result.stdout).toContain("C".repeat(50) + "...");
    });
  });

  describe("validation", () => {
    it("should reject --limit exceeding max for recap", () => {
      const db = seedDatabase(tempDir);
      db.close();

      const result = runCli(`recap --limit 1001 --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("--limit must be at most 1000");
    });

    it("should reject --sessions exceeding max for recap", () => {
      const db = seedDatabase(tempDir);
      db.close();

      const result = runCli(`recap --sessions 101 --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("--sessions must be at most 100");
    });

    it("should reject --last exceeding max for recap", () => {
      const db = seedDatabase(tempDir);
      db.close();

      const result = runCli(`recap --last 101 --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("--last must be at most 100");
    });
  });
});
