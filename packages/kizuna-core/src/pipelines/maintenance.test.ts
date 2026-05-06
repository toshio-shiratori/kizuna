import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "../storage/database.js";
import type { Session, RawChunk } from "../index.js";
import { runMaintenance } from "./maintenance.js";

function makeTempDb(): { db: Database; dir: string } {
  const dir = mkdtempSync(join(tmpdir(), "kizuna-maint-test-"));
  const db = new Database(join(dir, "test.db"));
  return { db, dir };
}

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: "sess-1",
    projectId: "proj-1",
    startedAt: "2025-01-01T00:00:00.000Z",
    endedAt: null,
    transcriptPath: null,
    metadata: {},
    ...overrides,
  };
}

function makeChunk(
  overrides: Partial<
    RawChunk & { tokenCount?: number; importance?: number; createdAt?: string }
  > = {},
): RawChunk & { tokenCount?: number; importance?: number; createdAt?: string } {
  return {
    sessionId: "sess-1",
    turnIndex: 0,
    role: "user",
    content: "test content",
    metadata: {},
    ...overrides,
  };
}

describe("runMaintenance", () => {
  let db: Database;
  let dir: string;

  beforeEach(() => {
    ({ db, dir } = makeTempDb());
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("runs maintenance and deletes old chunks", () => {
    db.insertSession(makeSession());

    // Insert a chunk that is 120 days old (older than 90-day default)
    const now = new Date("2025-06-01T00:00:00.000Z");
    const oldDate = new Date(now);
    oldDate.setDate(oldDate.getDate() - 120);

    db.insertChunk(
      makeChunk({
        turnIndex: 0,
        content: "old chunk",
        createdAt: oldDate.toISOString(),
      }),
    );

    // Insert a recent chunk
    db.insertChunk(
      makeChunk({
        turnIndex: 1,
        content: "recent chunk",
        createdAt: now.toISOString(),
      }),
    );

    const result = runMaintenance(db, { now });

    expect(result).not.toBeNull();
    expect(result!.chunksDeleted).toBe(1);

    // Verify the old chunk is gone and the recent one remains
    const remaining = db.getChunksBySession("sess-1");
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.content).toBe("recent chunk");
  });

  it("respects 24-hour throttle", () => {
    const now = new Date("2025-06-01T12:00:00.000Z");

    // Insert a maintenance run that happened 1 hour ago
    const recentRunTime = new Date(now);
    recentRunTime.setHours(recentRunTime.getHours() - 1);

    db.insertMaintenanceRun(
      {
        chunksDeleted: 0,
        sessionsDeleted: 0,
        bytesReclaimed: 0,
        durationMs: 10,
      },
      recentRunTime.toISOString(),
    );

    const result = runMaintenance(db, { now });
    expect(result).toBeNull();
  });

  it("runs when throttle period has passed", () => {
    const now = new Date("2025-06-01T12:00:00.000Z");

    // Insert a maintenance run that happened 25 hours ago
    const oldRunTime = new Date(now);
    oldRunTime.setHours(oldRunTime.getHours() - 25);

    db.insertMaintenanceRun(
      {
        chunksDeleted: 0,
        sessionsDeleted: 0,
        bytesReclaimed: 0,
        durationMs: 10,
      },
      oldRunTime.toISOString(),
    );

    const result = runMaintenance(db, { now });
    expect(result).not.toBeNull();
  });

  it("respects custom throttle hours", () => {
    const now = new Date("2025-06-01T12:00:00.000Z");

    // Insert a maintenance run that happened 5 hours ago
    const recentRunTime = new Date(now);
    recentRunTime.setHours(recentRunTime.getHours() - 5);

    db.insertMaintenanceRun(
      {
        chunksDeleted: 0,
        sessionsDeleted: 0,
        bytesReclaimed: 0,
        durationMs: 10,
      },
      recentRunTime.toISOString(),
    );

    // With default 24h throttle, this should be skipped
    expect(runMaintenance(db, { now })).toBeNull();

    // With 4h throttle, this should run (5 hours > 4 hours)
    expect(runMaintenance(db, { now, throttleHours: 4 })).not.toBeNull();
  });

  it("deletes empty sessions", () => {
    // Create a session with chunks
    db.insertSession(makeSession({ id: "has-chunks" }));
    db.insertChunk(
      makeChunk({
        sessionId: "has-chunks",
        content: "real content",
        createdAt: new Date().toISOString(),
      }),
    );

    // Create an empty session
    db.insertSession(makeSession({ id: "empty-session" }));

    const now = new Date("2025-06-01T00:00:00.000Z");
    const result = runMaintenance(db, { now });

    expect(result).not.toBeNull();
    expect(result!.sessionsDeleted).toBe(1);
    expect(db.getSession("empty-session")).toBeNull();
    expect(db.getSession("has-chunks")).not.toBeNull();
  });

  it("records maintenance run", () => {
    const now = new Date("2025-06-01T00:00:00.000Z");
    const result = runMaintenance(db, { now });

    expect(result).not.toBeNull();

    const lastRun = db.getLastMaintenanceRun();
    expect(lastRun).not.toBeNull();
    expect(lastRun!.ran_at).toBe(now.toISOString());
    expect(lastRun!.chunks_deleted).toBe(result!.chunksDeleted);
    expect(lastRun!.sessions_deleted).toBe(result!.sessionsDeleted);
  });

  it("works on empty database", () => {
    const now = new Date("2025-06-01T00:00:00.000Z");
    const result = runMaintenance(db, { now });

    expect(result).not.toBeNull();
    expect(result!.chunksDeleted).toBe(0);
    expect(result!.sessionsDeleted).toBe(0);
    expect(result!.bytesReclaimed).toBeGreaterThanOrEqual(0);
    expect(result!.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("respects custom retention days", () => {
    db.insertSession(makeSession());
    const now = new Date("2025-06-01T00:00:00.000Z");

    // Insert a chunk that is 40 days old
    const fortyDaysAgo = new Date(now);
    fortyDaysAgo.setDate(fortyDaysAgo.getDate() - 40);

    db.insertChunk(
      makeChunk({
        turnIndex: 0,
        content: "40 days old",
        createdAt: fortyDaysAgo.toISOString(),
      }),
    );

    // With default 90-day retention, chunk should survive
    const result1 = runMaintenance(db, { now, throttleHours: 0 });
    expect(result1).not.toBeNull();
    expect(result1!.chunksDeleted).toBe(0);
    expect(db.getChunksBySession("sess-1")).toHaveLength(1);

    // With 30-day retention, chunk should be deleted
    const result2 = runMaintenance(db, { now, throttleHours: 0, retentionDays: 30 });
    expect(result2).not.toBeNull();
    expect(result2!.chunksDeleted).toBe(1);
    expect(db.getChunksBySession("sess-1")).toHaveLength(0);
  });
});

describe("Database.deleteOldestChunksPercent", () => {
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

  it("deletes approximately 10% of chunks", () => {
    // Insert 20 chunks with varying timestamps
    for (let i = 0; i < 20; i++) {
      const date = new Date("2025-01-01T00:00:00.000Z");
      date.setMinutes(date.getMinutes() + i);
      db.insertChunk(
        makeChunk({
          turnIndex: i,
          content: `chunk ${i}`,
          createdAt: date.toISOString(),
        }),
      );
    }

    const deleted = db.deleteOldestChunksPercent(10);
    expect(deleted).toBe(2); // 10% of 20 = 2

    const remaining = db.getChunksBySession("sess-1");
    expect(remaining).toHaveLength(18);

    // The oldest chunks should be the ones deleted
    expect(remaining[0]!.content).toBe("chunk 2");
  });

  it("deletes at least 1 chunk even with small percentage", () => {
    // Insert 5 chunks
    for (let i = 0; i < 5; i++) {
      const date = new Date("2025-01-01T00:00:00.000Z");
      date.setMinutes(date.getMinutes() + i);
      db.insertChunk(
        makeChunk({
          turnIndex: i,
          content: `chunk ${i}`,
          createdAt: date.toISOString(),
        }),
      );
    }

    // 1% of 5 = 0.05, but MAX(1, ...) ensures at least 1
    const deleted = db.deleteOldestChunksPercent(1);
    expect(deleted).toBe(1);
  });

  it("returns 0 when no chunks exist", () => {
    const deleted = db.deleteOldestChunksPercent(10);
    expect(deleted).toBe(0);
  });
});
