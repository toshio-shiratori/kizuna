import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "../storage/database.js";
import { PluginManager } from "../plugin/plugin-manager.js";
import { parseTranscriptContent } from "./transcript-parser.js";
import { chunkifyTurns } from "./chunker.js";
import { captureTranscript } from "./capture.js";
import type { Plugin } from "../index.js";

function makeTranscriptLine(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "user",
    uuid: "uuid-1",
    timestamp: "2025-01-01T00:00:00.000Z",
    sessionId: "test-session",
    message: {
      role: "user",
      content: "hello",
    },
    ...overrides,
  });
}

describe("parseTranscriptContent", () => {
  it("parses user and assistant turns with string content", () => {
    const content = [
      makeTranscriptLine({
        type: "user",
        uuid: "u1",
        message: { role: "user", content: "What is TypeScript?" },
      }),
      makeTranscriptLine({
        type: "assistant",
        uuid: "a1",
        message: { role: "assistant", content: "TypeScript is a typed superset of JavaScript." },
      }),
    ].join("\n");

    const turns = parseTranscriptContent(content);
    expect(turns).toHaveLength(2);
    expect(turns[0]!.role).toBe("user");
    expect(turns[0]!.text).toBe("What is TypeScript?");
    expect(turns[1]!.role).toBe("assistant");
    expect(turns[1]!.text).toContain("TypeScript");
  });

  it("parses content blocks (array format)", () => {
    const content = makeTranscriptLine({
      type: "assistant",
      uuid: "a1",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "First part." },
          { type: "text", text: "Second part." },
        ],
      },
    });

    const turns = parseTranscriptContent(content);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.text).toBe("First part.\nSecond part.");
  });

  it("skips tool_use and tool_result blocks", () => {
    const content = makeTranscriptLine({
      type: "assistant",
      uuid: "a1",
      message: {
        role: "assistant",
        content: [
          { type: "text", text: "Let me check." },
          { type: "tool_use", id: "tool-1", name: "Read", input: {} },
        ],
      },
    });

    const turns = parseTranscriptContent(content);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.text).toBe("Let me check.");
  });

  it("skips tool_result user messages", () => {
    const content = makeTranscriptLine({
      type: "user",
      uuid: "u1",
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "tool-1", content: "file contents" }],
      },
    });

    const turns = parseTranscriptContent(content);
    expect(turns).toHaveLength(0);
  });

  it("skips non-message types", () => {
    const content = [
      JSON.stringify({ type: "permission-mode", permissionMode: "default", sessionId: "s1" }),
      JSON.stringify({ type: "file-history-snapshot", messageId: "m1", snapshot: {} }),
      makeTranscriptLine({
        type: "user",
        uuid: "u1",
        message: { role: "user", content: "real message" },
      }),
    ].join("\n");

    const turns = parseTranscriptContent(content);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.text).toBe("real message");
  });

  it("skips thinking blocks", () => {
    const content = makeTranscriptLine({
      type: "assistant",
      uuid: "a1",
      message: {
        role: "assistant",
        content: [
          { type: "thinking", thinking: "internal reasoning" },
          { type: "text", text: "Visible response." },
        ],
      },
    });

    const turns = parseTranscriptContent(content);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.text).toBe("Visible response.");
  });

  it("handles empty content gracefully", () => {
    expect(parseTranscriptContent("")).toHaveLength(0);
    expect(parseTranscriptContent("\n\n")).toHaveLength(0);
  });

  it("skips malformed JSON lines", () => {
    const content = [
      "not json",
      makeTranscriptLine({
        type: "user",
        uuid: "u1",
        message: { role: "user", content: "valid" },
      }),
    ].join("\n");

    const turns = parseTranscriptContent(content);
    expect(turns).toHaveLength(1);
  });

  it("handles Japanese content", () => {
    const content = makeTranscriptLine({
      type: "user",
      uuid: "u1",
      message: { role: "user", content: "このファイルを修正してください" },
    });

    const turns = parseTranscriptContent(content);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.text).toBe("このファイルを修正してください");
  });
});

describe("chunkifyTurns", () => {
  it("converts turns to chunks with sequential turn indices", () => {
    const turns = parseTranscriptContent(
      [
        makeTranscriptLine({
          type: "user",
          uuid: "u1",
          timestamp: "2025-01-01T00:00:00.000Z",
          message: { role: "user", content: "question" },
        }),
        makeTranscriptLine({
          type: "assistant",
          uuid: "a1",
          timestamp: "2025-01-01T00:00:01.000Z",
          message: { role: "assistant", content: "answer" },
        }),
      ].join("\n"),
    );

    const chunks = chunkifyTurns("sess-1", turns);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.sessionId).toBe("sess-1");
    expect(chunks[0]!.turnIndex).toBe(0);
    expect(chunks[0]!.role).toBe("user");
    expect(chunks[1]!.turnIndex).toBe(1);
    expect(chunks[1]!.role).toBe("assistant");
  });

  it("estimates token count", () => {
    const turns = parseTranscriptContent(
      makeTranscriptLine({
        type: "user",
        uuid: "u1",
        message: { role: "user", content: "hello world test" },
      }),
    );
    const chunks = chunkifyTurns("sess-1", turns);
    expect(chunks[0]!.tokenCount).toBeGreaterThan(0);
  });

  it("estimates higher token count for CJK text", () => {
    const asciiTurns = parseTranscriptContent(
      makeTranscriptLine({
        type: "user",
        uuid: "u1",
        message: { role: "user", content: "hello" },
      }),
    );
    const cjkTurns = parseTranscriptContent(
      makeTranscriptLine({
        type: "user",
        uuid: "u2",
        message: { role: "user", content: "日本語テスト" },
      }),
    );

    const asciiChunks = chunkifyTurns("s1", asciiTurns);
    const cjkChunks = chunkifyTurns("s2", cjkTurns);
    // 6 CJK chars × 2 = 12 tokens vs 5 ASCII chars × 0.25 = 2 tokens
    expect(cjkChunks[0]!.tokenCount).toBeGreaterThan(asciiChunks[0]!.tokenCount);
  });

  it("stores uuid and timestamp in metadata", () => {
    const turns = parseTranscriptContent(
      makeTranscriptLine({
        type: "user",
        uuid: "my-uuid",
        timestamp: "2025-06-15T12:00:00.000Z",
        message: { role: "user", content: "test" },
      }),
    );
    const chunks = chunkifyTurns("sess-1", turns);
    expect(chunks[0]!.metadata).toEqual({
      uuid: "my-uuid",
      timestamp: "2025-06-15T12:00:00.000Z",
    });
  });
});

describe("captureTranscript", () => {
  let db: Database;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "kizuna-test-"));
    db = new Database(join(dir, "test.db"));
  });

  afterEach(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("captures from transcript content", async () => {
    const content = [
      makeTranscriptLine({
        type: "user",
        uuid: "u1",
        timestamp: "2025-01-01T00:00:00.000Z",
        message: { role: "user", content: "question one" },
      }),
      makeTranscriptLine({
        type: "assistant",
        uuid: "a1",
        timestamp: "2025-01-01T00:00:01.000Z",
        message: { role: "assistant", content: "answer one" },
      }),
      makeTranscriptLine({
        type: "user",
        uuid: "u2",
        timestamp: "2025-01-01T00:00:02.000Z",
        message: { role: "user", content: "question two" },
      }),
    ].join("\n");

    const result = await captureTranscript(db, {
      sessionId: "sess-1",
      projectId: "proj-1",
      transcriptContent: content,
    });

    expect(result.sessionId).toBe("sess-1");
    expect(result.chunksStored).toBe(3);
    expect(result.totalTokens).toBeGreaterThan(0);

    const session = db.getSession("sess-1");
    expect(session).not.toBeNull();
    expect(session!.projectId).toBe("proj-1");
    expect(session!.startedAt).toBe("2025-01-01T00:00:00.000Z");
    expect(session!.endedAt).toBe("2025-01-01T00:00:02.000Z");

    const chunks = db.getChunksBySession("sess-1");
    expect(chunks).toHaveLength(3);
    expect(chunks[0]!.content).toBe("question one");
    expect(chunks[1]!.content).toBe("answer one");
    expect(chunks[2]!.content).toBe("question two");
  });

  it("captures from a transcript file", async () => {
    const filePath = join(dir, "transcript.jsonl");
    const content = [
      makeTranscriptLine({
        type: "user",
        uuid: "u1",
        timestamp: "2025-01-01T00:00:00.000Z",
        message: { role: "user", content: "file-based test" },
      }),
    ].join("\n");
    writeFileSync(filePath, content);

    const result = await captureTranscript(db, {
      sessionId: "sess-file",
      projectId: "proj-1",
      transcriptPath: filePath,
    });

    expect(result.chunksStored).toBe(1);
    const session = db.getSession("sess-file");
    expect(session!.transcriptPath).toBe(filePath);
  });

  it("returns zero counts for empty transcript", async () => {
    const result = await captureTranscript(db, {
      sessionId: "sess-empty",
      projectId: "proj-1",
      transcriptContent: "",
    });

    expect(result.chunksStored).toBe(0);
    expect(result.totalTokens).toBe(0);
    expect(db.getSession("sess-empty")).toBeNull();
  });

  it("captures chunks that are searchable via FTS", async () => {
    const content = makeTranscriptLine({
      type: "user",
      uuid: "u1",
      timestamp: "2025-01-01T00:00:00.000Z",
      message: { role: "user", content: "implement the authentication module" },
    });

    await captureTranscript(db, {
      sessionId: "sess-search",
      projectId: "proj-1",
      transcriptContent: content,
    });

    const results = db.searchChunks("authentication");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.chunk.content).toContain("authentication");
  });

  it("runs beforeCapture hooks on each chunk", async () => {
    const pm = new PluginManager({ db: db.db, projectConfig: { id: "test" } });
    const plugin: Plugin = {
      name: "upper-plugin",
      version: "1.0.0",
      beforeCapture(chunk) {
        return { ...chunk, content: chunk.content.toUpperCase() };
      },
    };
    pm.register(plugin);
    await pm.initAll();

    const content = makeTranscriptLine({
      type: "user",
      uuid: "u1",
      timestamp: "2025-01-01T00:00:00.000Z",
      message: { role: "user", content: "hello world" },
    });

    const result = await captureTranscript(db, {
      sessionId: "sess-plugin",
      projectId: "proj-1",
      transcriptContent: content,
      pluginManager: pm,
    });

    expect(result.chunksStored).toBe(1);
    const chunks = db.getChunksBySession("sess-plugin");
    expect(chunks[0]!.content).toBe("HELLO WORLD");
  });

  it("skips chunks when beforeCapture returns null", async () => {
    const pm = new PluginManager({ db: db.db, projectConfig: { id: "test" } });
    const plugin: Plugin = {
      name: "filter-plugin",
      version: "1.0.0",
      beforeCapture(chunk) {
        return chunk.role === "user" ? null : chunk;
      },
    };
    pm.register(plugin);
    await pm.initAll();

    const content = [
      makeTranscriptLine({
        type: "user",
        uuid: "u1",
        timestamp: "2025-01-01T00:00:00.000Z",
        message: { role: "user", content: "user message" },
      }),
      makeTranscriptLine({
        type: "assistant",
        uuid: "a1",
        timestamp: "2025-01-01T00:00:01.000Z",
        message: { role: "assistant", content: "assistant message" },
      }),
    ].join("\n");

    const result = await captureTranscript(db, {
      sessionId: "sess-filter",
      projectId: "proj-1",
      transcriptContent: content,
      pluginManager: pm,
    });

    expect(result.chunksStored).toBe(1);
    expect(result.chunksSkipped).toBe(1);
    const chunks = db.getChunksBySession("sess-filter");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.role).toBe("assistant");
  });

  it("calls afterCapture for each stored chunk", async () => {
    const afterCaptureFn = vi.fn();
    const pm = new PluginManager({ db: db.db, projectConfig: { id: "test" } });
    pm.register({
      name: "after-plugin",
      version: "1.0.0",
      afterCapture: afterCaptureFn,
    });
    await pm.initAll();

    const content = [
      makeTranscriptLine({
        type: "user",
        uuid: "u1",
        timestamp: "2025-01-01T00:00:00.000Z",
        message: { role: "user", content: "msg1" },
      }),
      makeTranscriptLine({
        type: "assistant",
        uuid: "a1",
        timestamp: "2025-01-01T00:00:01.000Z",
        message: { role: "assistant", content: "msg2" },
      }),
    ].join("\n");

    await captureTranscript(db, {
      sessionId: "sess-after",
      projectId: "proj-1",
      transcriptContent: content,
      pluginManager: pm,
    });

    expect(afterCaptureFn).toHaveBeenCalledTimes(2);
    expect(afterCaptureFn.mock.calls[0]![0].content).toBe("msg1");
    expect(afterCaptureFn.mock.calls[1]![0].content).toBe("msg2");
  });

  it("captures incrementally on repeated calls with same session", async () => {
    const content1 = [
      makeTranscriptLine({
        type: "user",
        uuid: "u1",
        timestamp: "2025-01-01T00:00:00.000Z",
        message: { role: "user", content: "first question" },
      }),
      makeTranscriptLine({
        type: "assistant",
        uuid: "a1",
        timestamp: "2025-01-01T00:00:01.000Z",
        message: { role: "assistant", content: "first answer" },
      }),
    ].join("\n");

    const result1 = await captureTranscript(db, {
      sessionId: "sess-inc",
      projectId: "proj-1",
      transcriptContent: content1,
    });
    expect(result1.chunksStored).toBe(2);

    const content2 = [
      makeTranscriptLine({
        type: "user",
        uuid: "u1",
        timestamp: "2025-01-01T00:00:00.000Z",
        message: { role: "user", content: "first question" },
      }),
      makeTranscriptLine({
        type: "assistant",
        uuid: "a1",
        timestamp: "2025-01-01T00:00:01.000Z",
        message: { role: "assistant", content: "first answer" },
      }),
      makeTranscriptLine({
        type: "user",
        uuid: "u2",
        timestamp: "2025-01-01T00:00:02.000Z",
        message: { role: "user", content: "second question" },
      }),
      makeTranscriptLine({
        type: "assistant",
        uuid: "a2",
        timestamp: "2025-01-01T00:00:03.000Z",
        message: { role: "assistant", content: "second answer" },
      }),
    ].join("\n");

    const result2 = await captureTranscript(db, {
      sessionId: "sess-inc",
      projectId: "proj-1",
      transcriptContent: content2,
    });
    expect(result2.chunksStored).toBe(2);

    const chunks = db.getChunksBySession("sess-inc");
    expect(chunks).toHaveLength(4);
    expect(chunks[0]!.content).toBe("first question");
    expect(chunks[3]!.content).toBe("second answer");
  });

  it("updates session ended_at on incremental capture", async () => {
    const content1 = makeTranscriptLine({
      type: "user",
      uuid: "u1",
      timestamp: "2025-01-01T00:00:00.000Z",
      message: { role: "user", content: "initial" },
    });

    await captureTranscript(db, {
      sessionId: "sess-upsert",
      projectId: "proj-1",
      transcriptContent: content1,
    });

    const session1 = db.getSession("sess-upsert");
    expect(session1!.endedAt).toBe("2025-01-01T00:00:00.000Z");

    const content2 = [
      makeTranscriptLine({
        type: "user",
        uuid: "u1",
        timestamp: "2025-01-01T00:00:00.000Z",
        message: { role: "user", content: "initial" },
      }),
      makeTranscriptLine({
        type: "assistant",
        uuid: "a1",
        timestamp: "2025-01-01T00:05:00.000Z",
        message: { role: "assistant", content: "later response" },
      }),
    ].join("\n");

    await captureTranscript(db, {
      sessionId: "sess-upsert",
      projectId: "proj-1",
      transcriptContent: content2,
    });

    const session2 = db.getSession("sess-upsert");
    expect(session2!.endedAt).toBe("2025-01-01T00:05:00.000Z");
  });

  it("does not duplicate chunks on idempotent call with no new turns", async () => {
    const content = makeTranscriptLine({
      type: "user",
      uuid: "u1",
      timestamp: "2025-01-01T00:00:00.000Z",
      message: { role: "user", content: "only message" },
    });

    await captureTranscript(db, {
      sessionId: "sess-idem",
      projectId: "proj-1",
      transcriptContent: content,
    });

    const result = await captureTranscript(db, {
      sessionId: "sess-idem",
      projectId: "proj-1",
      transcriptContent: content,
    });

    expect(result.chunksStored).toBe(0);
    const chunks = db.getChunksBySession("sess-idem");
    expect(chunks).toHaveLength(1);
  });

  it("continues capture when a plugin throws in beforeCapture", async () => {
    const pm = new PluginManager({ db: db.db, projectConfig: { id: "test" } });
    pm.register({
      name: "error-plugin",
      version: "1.0.0",
      beforeCapture() {
        throw new Error("plugin error");
      },
    });
    await pm.initAll();

    const content = makeTranscriptLine({
      type: "user",
      uuid: "u1",
      timestamp: "2025-01-01T00:00:00.000Z",
      message: { role: "user", content: "should still be stored" },
    });

    const result = await captureTranscript(db, {
      sessionId: "sess-error",
      projectId: "proj-1",
      transcriptContent: content,
      pluginManager: pm,
    });

    expect(result.chunksStored).toBe(1);
  });
});
