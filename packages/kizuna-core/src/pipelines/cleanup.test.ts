import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "../storage/database.js";
import {
  findLowQualityChunks,
  findChunksByQuery,
  executeCleanup,
  cleanupChunks,
} from "./cleanup.js";
import type { Session, RawChunk } from "../index.js";

function makeTempDb(): { db: Database; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "kizuna-cleanup-test-"));
  const db = new Database(join(dir, "test.db"));
  return { db, dir };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "session-1",
    projectId: "test-project",
    startedAt: "2026-01-01T00:00:00Z",
    endedAt: "2026-01-01T01:00:00Z",
    transcriptPath: null,
    metadata: {},
    ...overrides,
  };
}

function makeChunk(overrides: Partial<RawChunk> = {}): RawChunk {
  return {
    sessionId: "session-1",
    turnIndex: 0,
    role: "user",
    content: "これはテスト用の十分な長さの内容です",
    metadata: {},
    ...overrides,
  };
}

describe("findLowQualityChunks", () => {
  let db: Database;
  let dir: string;

  beforeEach(() => {
    ({ db, dir } = makeTempDb());
    db.insertSession(makeSession());
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns empty array when no low-quality chunks exist", () => {
    db.insertChunk(makeChunk({ content: "This is a normal length content for testing" }));
    db.insertChunk(makeChunk({ turnIndex: 1, content: "認証フローを実装してください" }));

    const targets = findLowQualityChunks(db);
    expect(targets).toHaveLength(0);
  });

  it("detects short content like YES, OK, and Japanese equivalents", () => {
    db.insertChunk(makeChunk({ turnIndex: 0, content: "YES" }));
    db.insertChunk(makeChunk({ turnIndex: 1, content: "OK" }));
    db.insertChunk(makeChunk({ turnIndex: 2, content: "はい" }));
    db.insertChunk(makeChunk({ turnIndex: 3, content: "了解" }));

    const targets = findLowQualityChunks(db);
    expect(targets).toHaveLength(4);
    expect(targets.map((t) => t.content)).toEqual(
      expect.arrayContaining(["YES", "OK", "はい", "了解"]),
    );
  });

  it("detects chunks that become empty after system-reminder sanitization", () => {
    const systemReminderOnly =
      "<system-reminder>UserPromptSubmit hook: memory injection here</system-reminder>";
    db.insertChunk(makeChunk({ turnIndex: 0, content: systemReminderOnly }));

    const targets = findLowQualityChunks(db);
    expect(targets).toHaveLength(1);
    expect(targets[0]!.content).toBe(systemReminderOnly);
  });

  it("detects chunks containing command-name tags", () => {
    const commandContent =
      "<command-message>session-start</command-message>\n<command-name>/session-start</command-name>\n## Usage";
    db.insertChunk(makeChunk({ turnIndex: 0, content: commandContent }));

    const targets = findLowQualityChunks(db);
    expect(targets).toHaveLength(1);
    expect(targets[0]!.content).toBe(commandContent);
  });

  it("does not flag normal quality content", () => {
    db.insertChunk(
      makeChunk({ turnIndex: 0, content: "implement the authentication module for the app" }),
    );
    db.insertChunk(
      makeChunk({
        turnIndex: 1,
        role: "assistant",
        content: "TypeScript is a typed superset of JavaScript",
      }),
    );
    db.insertChunk(makeChunk({ turnIndex: 2, content: "このファイルのバグを修正してください" }));

    const targets = findLowQualityChunks(db);
    expect(targets).toHaveLength(0);
  });

  it("returns only low-quality chunks from mixed data", () => {
    db.insertChunk(
      makeChunk({
        turnIndex: 0,
        content: "implement the authentication module for the app",
      }),
    );
    db.insertChunk(makeChunk({ turnIndex: 1, content: "OK" }));
    db.insertChunk(
      makeChunk({
        turnIndex: 2,
        role: "assistant",
        content: "ここにバグの修正方法を説明します",
      }),
    );
    db.insertChunk(
      makeChunk({
        turnIndex: 3,
        content: "<system-reminder>injected memory</system-reminder>",
      }),
    );
    db.insertChunk(
      makeChunk({
        turnIndex: 4,
        content: "<command-message>test</command-message>\n<command-name>/test</command-name>",
      }),
    );

    const targets = findLowQualityChunks(db);
    expect(targets).toHaveLength(3);

    const contents = targets.map((t) => t.content);
    expect(contents).toContain("OK");
    expect(contents).toContain("<system-reminder>injected memory</system-reminder>");
    expect(contents).toContain(
      "<command-message>test</command-message>\n<command-name>/test</command-name>",
    );
  });

  it("returns correct CleanupTarget fields", () => {
    db.insertChunk(makeChunk({ turnIndex: 0, content: "short" }));

    const targets = findLowQualityChunks(db);
    expect(targets).toHaveLength(1);
    const target = targets[0]!;
    expect(target.id).toBeGreaterThan(0);
    expect(target.content).toBe("short");
    expect(target.role).toBe("user");
    expect(target.sessionId).toBe("session-1");
    expect(target.createdAt).toBeTruthy();
  });

  it("returns empty array when database has no chunks", () => {
    const targets = findLowQualityChunks(db);
    expect(targets).toHaveLength(0);
  });

  it("detects whitespace-only content as low quality", () => {
    db.insertChunk(makeChunk({ turnIndex: 0, content: "   " }));

    const targets = findLowQualityChunks(db);
    expect(targets).toHaveLength(1);
  });
});

describe("cleanupChunks", () => {
  let db: Database;
  let dir: string;

  beforeEach(() => {
    ({ db, dir } = makeTempDb());
    db.insertSession(makeSession());
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns zero counts when no low-quality chunks exist", () => {
    db.insertChunk(makeChunk({ content: "This is perfectly fine content for the test" }));

    const result = cleanupChunks(db);
    expect(result.chunksDeleted).toBe(0);
    expect(result.sessionsDeleted).toBe(0);
    expect(result.bytesReclaimed).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("returns zero counts when database is empty", () => {
    const result = cleanupChunks(db);
    expect(result.chunksDeleted).toBe(0);
    expect(result.sessionsDeleted).toBe(0);
    expect(result.bytesReclaimed).toBe(0);
  });

  it("deletes low-quality chunks", () => {
    db.insertChunk(makeChunk({ turnIndex: 0, content: "OK" }));
    db.insertChunk(makeChunk({ turnIndex: 1, content: "YES" }));
    db.insertChunk(
      makeChunk({
        turnIndex: 2,
        content: "This content is long enough to survive cleanup",
      }),
    );

    const result = cleanupChunks(db);
    expect(result.chunksDeleted).toBe(2);

    const remaining = db.getChunksBySession("session-1");
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.content).toBe("This content is long enough to survive cleanup");
  });

  it("deletes sessions that become empty after chunk cleanup", () => {
    db.insertSession(makeSession({ id: "session-2" }));

    db.insertChunk(makeChunk({ turnIndex: 0, content: "OK" }));
    db.insertChunk(
      makeChunk({
        sessionId: "session-2",
        turnIndex: 0,
        content: "This session has good content and should remain",
      }),
    );

    const result = cleanupChunks(db);
    expect(result.chunksDeleted).toBe(1);
    expect(result.sessionsDeleted).toBe(1);

    expect(db.getSession("session-1")).toBeNull();
    expect(db.getSession("session-2")).not.toBeNull();
  });

  it("returns durationMs as a non-negative number", () => {
    db.insertChunk(makeChunk({ turnIndex: 0, content: "YES" }));

    const result = cleanupChunks(db);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.durationMs)).toBe(true);
  });

  it("returns bytesReclaimed as a non-negative number", () => {
    db.insertChunk(makeChunk({ turnIndex: 0, content: "OK" }));
    db.insertChunk(makeChunk({ turnIndex: 1, content: "YES" }));
    db.insertChunk(makeChunk({ turnIndex: 2, content: "NO" }));

    const result = cleanupChunks(db);
    expect(result.bytesReclaimed).toBeGreaterThanOrEqual(0);
  });

  it("handles mixed quality chunks across multiple sessions", () => {
    db.insertSession(makeSession({ id: "session-2" }));
    db.insertSession(makeSession({ id: "session-3" }));

    db.insertChunk(makeChunk({ turnIndex: 0, content: "OK" }));
    db.insertChunk(
      makeChunk({
        sessionId: "session-2",
        turnIndex: 0,
        content: "YES",
      }),
    );
    db.insertChunk(
      makeChunk({
        sessionId: "session-3",
        turnIndex: 0,
        content: "This is good content that should remain after cleanup",
      }),
    );

    const result = cleanupChunks(db);
    expect(result.chunksDeleted).toBe(2);
    expect(result.sessionsDeleted).toBe(2);

    expect(db.getSession("session-1")).toBeNull();
    expect(db.getSession("session-2")).toBeNull();
    expect(db.getSession("session-3")).not.toBeNull();
  });

  it("correctly cleans up system-reminder-only chunks", () => {
    db.insertChunk(
      makeChunk({
        turnIndex: 0,
        content: "<system-reminder>Memory injection data here</system-reminder>",
      }),
    );
    db.insertChunk(
      makeChunk({
        turnIndex: 1,
        content: "This content is real and should be preserved after cleanup",
      }),
    );

    const result = cleanupChunks(db);
    expect(result.chunksDeleted).toBe(1);

    const remaining = db.getChunksBySession("session-1");
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.content).toBe(
      "This content is real and should be preserved after cleanup",
    );
  });

  it("correctly cleans up command invocation chunks", () => {
    db.insertChunk(
      makeChunk({
        turnIndex: 0,
        content:
          "<command-message>start</command-message>\n<command-name>/start</command-name>\n## Info",
      }),
    );

    const result = cleanupChunks(db);
    expect(result.chunksDeleted).toBe(1);
    expect(db.getChunksBySession("session-1")).toHaveLength(0);
  });

  it("cleans up Japanese low-quality content", () => {
    db.insertChunk(makeChunk({ turnIndex: 0, content: "はい" }));
    db.insertChunk(makeChunk({ turnIndex: 1, content: "了解" }));
    db.insertChunk(
      makeChunk({
        turnIndex: 2,
        content: "このプロジェクトの認証フローを実装する必要があります",
      }),
    );

    const result = cleanupChunks(db);
    expect(result.chunksDeleted).toBe(2);

    const remaining = db.getChunksBySession("session-1");
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.content).toBe("このプロジェクトの認証フローを実装する必要があります");
  });
});

describe("findChunksByQuery", () => {
  let db: Database;
  let dir: string;

  beforeEach(() => {
    ({ db, dir } = makeTempDb());
    db.insertSession(makeSession());
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("finds chunks matching an English query", () => {
    db.insertChunk(makeChunk({ turnIndex: 0, content: "implement the authentication module" }));
    db.insertChunk(makeChunk({ turnIndex: 1, content: "database connection setup guide" }));
    db.insertChunk(makeChunk({ turnIndex: 2, content: "authentication flow design notes" }));

    const targets = findChunksByQuery(db, "authentication");
    expect(targets).toHaveLength(2);
    expect(targets.map((t) => t.content)).toEqual(
      expect.arrayContaining([
        "implement the authentication module",
        "authentication flow design notes",
      ]),
    );
  });

  it("finds chunks matching a Japanese query", () => {
    db.insertChunk(makeChunk({ turnIndex: 0, content: "認証フローを実装してください" }));
    db.insertChunk(makeChunk({ turnIndex: 1, content: "データベース接続の設定方法" }));
    db.insertChunk(makeChunk({ turnIndex: 2, content: "認証モジュールのテスト結果" }));

    const targets = findChunksByQuery(db, "認証フロー");
    expect(targets.length).toBeGreaterThanOrEqual(1);
    const contents = targets.map((t) => t.content);
    expect(contents).toContain("認証フローを実装してください");
  });

  it("returns empty array when no chunks match", () => {
    db.insertChunk(makeChunk({ turnIndex: 0, content: "database connection setup guide" }));

    const targets = findChunksByQuery(db, "authentication");
    expect(targets).toHaveLength(0);
  });

  it("returns empty array for empty query", () => {
    db.insertChunk(makeChunk({ turnIndex: 0, content: "some content for testing" }));

    const targets = findChunksByQuery(db, "");
    expect(targets).toHaveLength(0);
  });

  it("returns empty array when database has no chunks", () => {
    const targets = findChunksByQuery(db, "anything");
    expect(targets).toHaveLength(0);
  });

  it("returns all matching chunks without limit", () => {
    for (let i = 0; i < 25; i++) {
      db.insertChunk(
        makeChunk({ turnIndex: i, content: `authentication module test case number ${i}` }),
      );
    }

    const targets = findChunksByQuery(db, "authentication");
    expect(targets).toHaveLength(25);
  });

  it("returns correct CleanupTarget fields", () => {
    db.insertChunk(
      makeChunk({
        turnIndex: 0,
        role: "assistant",
        content: "implement the authentication module for testing",
      }),
    );

    const targets = findChunksByQuery(db, "authentication");
    expect(targets).toHaveLength(1);
    const target = targets[0]!;
    expect(target.id).toBeGreaterThan(0);
    expect(target.content).toBe("implement the authentication module for testing");
    expect(target.role).toBe("assistant");
    expect(target.sessionId).toBe("session-1");
    expect(target.createdAt).toBeTruthy();
  });

  it("finds chunks via LIKE fallback for short CJK query", () => {
    db.insertChunk(makeChunk({ turnIndex: 0, content: "認証フローを実装してください" }));
    db.insertChunk(makeChunk({ turnIndex: 1, content: "データベース接続の設定方法" }));
    db.insertChunk(makeChunk({ turnIndex: 2, content: "認証モジュールのテスト結果" }));

    // "認証" is 2 chars CJK, which uses LIKE-only fallback
    const targets = findChunksByQuery(db, "認証");
    expect(targets.length).toBeGreaterThanOrEqual(2);
    const contents = targets.map((t) => t.content);
    expect(contents).toContain("認証フローを実装してください");
    expect(contents).toContain("認証モジュールのテスト結果");
  });
});

describe("executeCleanup", () => {
  let db: Database;
  let dir: string;

  beforeEach(() => {
    ({ db, dir } = makeTempDb());
    db.insertSession(makeSession());
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("returns zero counts for empty targets", () => {
    const result = executeCleanup(db, []);
    expect(result.chunksDeleted).toBe(0);
    expect(result.sessionsDeleted).toBe(0);
    expect(result.bytesReclaimed).toBe(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("deletes specified targets", () => {
    const chunk1 = db.insertChunk(
      makeChunk({ turnIndex: 0, content: "content to delete for cleanup" }),
    );
    db.insertChunk(makeChunk({ turnIndex: 1, content: "content to keep in database" }));

    const targets = [
      {
        id: chunk1.id,
        content: chunk1.content,
        role: chunk1.role,
        sessionId: chunk1.sessionId,
        createdAt: chunk1.createdAt,
      },
    ];

    const result = executeCleanup(db, targets);
    expect(result.chunksDeleted).toBe(1);

    const remaining = db.getChunksBySession("session-1");
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.content).toBe("content to keep in database");
  });

  it("deletes sessions that become empty", () => {
    db.insertSession(makeSession({ id: "session-2" }));

    const chunk1 = db.insertChunk(
      makeChunk({ turnIndex: 0, content: "only chunk in session one" }),
    );
    db.insertChunk(
      makeChunk({
        sessionId: "session-2",
        turnIndex: 0,
        content: "chunk in session two survives",
      }),
    );

    const targets = [
      {
        id: chunk1.id,
        content: chunk1.content,
        role: chunk1.role,
        sessionId: chunk1.sessionId,
        createdAt: chunk1.createdAt,
      },
    ];

    const result = executeCleanup(db, targets);
    expect(result.chunksDeleted).toBe(1);
    expect(result.sessionsDeleted).toBe(1);

    expect(db.getSession("session-1")).toBeNull();
    expect(db.getSession("session-2")).not.toBeNull();
  });

  it("returns non-negative bytesReclaimed and durationMs", () => {
    const chunk = db.insertChunk(
      makeChunk({ turnIndex: 0, content: "content that will be deleted" }),
    );

    const targets = [
      {
        id: chunk.id,
        content: chunk.content,
        role: chunk.role,
        sessionId: chunk.sessionId,
        createdAt: chunk.createdAt,
      },
    ];

    const result = executeCleanup(db, targets);
    expect(result.bytesReclaimed).toBeGreaterThanOrEqual(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(Number.isInteger(result.durationMs)).toBe(true);
  });
});
