import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "../storage/database.js";
import { PluginManager } from "../plugin/plugin-manager.js";
import { parseTranscriptContent, sanitizeContent } from "./transcript-parser.js";
import { chunkifyTurns, isLowQualityContent, MIN_CONTENT_LENGTH } from "./chunker.js";
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
        message: { role: "user", content: "first user message here" },
      }),
      makeTranscriptLine({
        type: "assistant",
        uuid: "a1",
        timestamp: "2025-01-01T00:00:01.000Z",
        message: { role: "assistant", content: "first assistant reply" },
      }),
    ].join("\n");

    await captureTranscript(db, {
      sessionId: "sess-after",
      projectId: "proj-1",
      transcriptContent: content,
      pluginManager: pm,
    });

    expect(afterCaptureFn).toHaveBeenCalledTimes(2);
    expect(afterCaptureFn.mock.calls[0]![0].content).toBe("first user message here");
    expect(afterCaptureFn.mock.calls[1]![0].content).toBe("first assistant reply");
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

  it("skips low-quality chunks (short content)", async () => {
    const content = [
      makeTranscriptLine({
        type: "user",
        uuid: "u1",
        timestamp: "2025-01-01T00:00:00.000Z",
        message: { role: "user", content: "YES" },
      }),
      makeTranscriptLine({
        type: "assistant",
        uuid: "a1",
        timestamp: "2025-01-01T00:00:01.000Z",
        message: { role: "assistant", content: "understood, proceeding with the task" },
      }),
      makeTranscriptLine({
        type: "user",
        uuid: "u2",
        timestamp: "2025-01-01T00:00:02.000Z",
        message: { role: "user", content: "OK" },
      }),
    ].join("\n");

    const result = await captureTranscript(db, {
      sessionId: "sess-quality",
      projectId: "proj-1",
      transcriptContent: content,
    });

    expect(result.chunksStored).toBe(1);
    expect(result.chunksSkipped).toBe(2);
    const chunks = db.getChunksBySession("sess-quality");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toBe("understood, proceeding with the task");
  });

  it("strips system-reminder tags before capturing", async () => {
    const userMessage =
      "<system-reminder>UserPromptSubmit hook success: ## Relevant Memories\n### old memory\n</system-reminder>\nWhat should I work on next?";
    const content = makeTranscriptLine({
      type: "user",
      uuid: "u1",
      timestamp: "2025-01-01T00:00:00.000Z",
      message: { role: "user", content: userMessage },
    });

    const result = await captureTranscript(db, {
      sessionId: "sess-sanitize",
      projectId: "proj-1",
      transcriptContent: content,
    });

    expect(result.chunksStored).toBe(1);
    const chunks = db.getChunksBySession("sess-sanitize");
    expect(chunks[0]!.content).toBe("What should I work on next?");
    expect(chunks[0]!.content).not.toContain("system-reminder");
  });

  it("strips 'Base directory' prefix from skill responses", async () => {
    const content = makeTranscriptLine({
      type: "assistant",
      uuid: "a1",
      timestamp: "2025-01-01T00:00:00.000Z",
      message: {
        role: "assistant",
        content:
          "Base directory for this skill: /path/.claude/skills/session-start\n\nHere is the actual status report with useful content.",
      },
    });

    const result = await captureTranscript(db, {
      sessionId: "sess-basedir",
      projectId: "proj-1",
      transcriptContent: content,
    });

    expect(result.chunksStored).toBe(1);
    const chunks = db.getChunksBySession("sess-basedir");
    expect(chunks[0]!.content).not.toContain("Base directory");
    expect(chunks[0]!.content).toContain("actual status report");
  });

  it("skips session boilerplate chunks", async () => {
    const content = [
      makeTranscriptLine({
        type: "assistant",
        uuid: "a1",
        timestamp: "2025-01-01T00:00:00.000Z",
        message: { role: "assistant", content: "セッション開始チェックを実行します。" },
      }),
      makeTranscriptLine({
        type: "assistant",
        uuid: "a2",
        timestamp: "2025-01-01T00:00:01.000Z",
        message: { role: "assistant", content: "Here is the detailed session status report." },
      }),
    ].join("\n");

    const result = await captureTranscript(db, {
      sessionId: "sess-boilerplate",
      projectId: "proj-1",
      transcriptContent: content,
    });

    expect(result.chunksStored).toBe(1);
    expect(result.chunksSkipped).toBe(1);
    const chunks = db.getChunksBySession("sess-boilerplate");
    expect(chunks[0]!.content).toContain("detailed session status report");
  });

  it("skips command invocation turns entirely", async () => {
    const commandContent =
      "<command-message>session-start</command-message>\n<command-name>/session-start</command-name>\n## When to Use\n- template content here";
    const content = [
      makeTranscriptLine({
        type: "user",
        uuid: "u1",
        timestamp: "2025-01-01T00:00:00.000Z",
        message: { role: "user", content: commandContent },
      }),
      makeTranscriptLine({
        type: "assistant",
        uuid: "a1",
        timestamp: "2025-01-01T00:00:01.000Z",
        message: {
          role: "assistant",
          content: "Session started. Here is the status report.",
        },
      }),
    ].join("\n");

    const result = await captureTranscript(db, {
      sessionId: "sess-command",
      projectId: "proj-1",
      transcriptContent: content,
    });

    expect(result.chunksStored).toBe(1);
    const chunks = db.getChunksBySession("sess-command");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.role).toBe("assistant");
  });

  it("skips chunks matching user-defined noise patterns", async () => {
    const content = [
      makeTranscriptLine({
        type: "assistant",
        uuid: "a1",
        timestamp: "2025-01-01T00:00:00.000Z",
        message: { role: "assistant", content: "frontend-design skill output here" },
      }),
      makeTranscriptLine({
        type: "assistant",
        uuid: "a2",
        timestamp: "2025-01-01T00:00:01.000Z",
        message: { role: "assistant", content: "Here is the actual implementation plan." },
      }),
    ].join("\n");

    const result = await captureTranscript(db, {
      sessionId: "sess-noise",
      projectId: "proj-1",
      transcriptContent: content,
      noisePatterns: ["frontend-design"],
    });

    expect(result.chunksStored).toBe(1);
    expect(result.chunksSkipped).toBe(1);
    const chunks = db.getChunksBySession("sess-noise");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toContain("actual implementation plan");
  });

  it("skips chunks matching user-defined regex noise patterns", async () => {
    const content = [
      makeTranscriptLine({
        type: "assistant",
        uuid: "a1",
        timestamp: "2025-01-01T00:00:00.000Z",
        message: { role: "assistant", content: "## Custom Skill Template\nSome template content" },
      }),
      makeTranscriptLine({
        type: "user",
        uuid: "u1",
        timestamp: "2025-01-01T00:00:01.000Z",
        message: { role: "user", content: "Please implement the auth module" },
      }),
    ].join("\n");

    const result = await captureTranscript(db, {
      sessionId: "sess-regex-noise",
      projectId: "proj-1",
      transcriptContent: content,
      noisePatterns: ["^## Custom Skill Template"],
    });

    expect(result.chunksStored).toBe(1);
    expect(result.chunksSkipped).toBe(1);
    const chunks = db.getChunksBySession("sess-regex-noise");
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.content).toContain("auth module");
  });

  it("captures normally when noisePatterns is not provided", async () => {
    const content = makeTranscriptLine({
      type: "assistant",
      uuid: "a1",
      timestamp: "2025-01-01T00:00:00.000Z",
      message: { role: "assistant", content: "frontend-design skill output here" },
    });

    const result = await captureTranscript(db, {
      sessionId: "sess-no-patterns",
      projectId: "proj-1",
      transcriptContent: content,
    });

    expect(result.chunksStored).toBe(1);
  });
});

describe("sanitizeContent", () => {
  it("strips system-reminder tags and their content", () => {
    const input = "<system-reminder>hook output here</system-reminder>\nActual user message";
    expect(sanitizeContent(input)).toBe("Actual user message");
  });

  it("strips multiple system-reminder blocks", () => {
    const input =
      "<system-reminder>block1</system-reminder>\nMiddle\n<system-reminder>block2</system-reminder>";
    expect(sanitizeContent(input)).toBe("Middle");
  });

  it("returns empty string for command invocations", () => {
    const input =
      "<command-message>test</command-message>\n<command-name>/test</command-name>\n## Template";
    expect(sanitizeContent(input)).toBe("");
  });

  it("strips local-command-caveat tags", () => {
    const input =
      "<local-command-caveat>Caveat: generated messages</local-command-caveat>\nReal content";
    expect(sanitizeContent(input)).toBe("Real content");
  });

  it("strips command-message tags without command-name", () => {
    const input = "<command-message>clear</command-message>\nSome actual text after";
    expect(sanitizeContent(input)).toBe("Some actual text after");
  });

  it("returns text unchanged when no system tags present", () => {
    expect(sanitizeContent("normal user message")).toBe("normal user message");
    expect(sanitizeContent("日本語のメッセージ")).toBe("日本語のメッセージ");
  });

  it("handles multiline system-reminder content", () => {
    const input = "<system-reminder>\nLine 1\nLine 2\nLine 3\n</system-reminder>\nUser text";
    expect(sanitizeContent(input)).toBe("User text");
  });

  it("returns empty string for empty input", () => {
    expect(sanitizeContent("")).toBe("");
    expect(sanitizeContent("   ")).toBe("");
  });

  it("strips 'Base directory for this skill:' lines", () => {
    const input =
      "Base directory for this skill: /Users/test/project/.claude/skills/session-start\n\nセッション開始チェックを実行します。以下の順序で確認します。";
    const result = sanitizeContent(input);
    expect(result).not.toContain("Base directory");
    expect(result).toContain("セッション開始チェックを実行します。");
  });

  it("strips 'Base directory' line even in the middle of content", () => {
    const input =
      "Some text before\nBase directory for this skill: /path/to/skill\nSome text after";
    expect(sanitizeContent(input)).toBe("Some text before\n\nSome text after");
  });

  it("returns empty when content is only 'Base directory' line", () => {
    expect(sanitizeContent("Base directory for this skill: /path/to/skill")).toBe("");
  });

  it("should remove command-name tags", () => {
    expect(
      sanitizeContent("Some text\n<command-name>/session-start</command-name>\nMore text"),
    ).toBe("");
  });

  it("should remove Available tools noise", () => {
    const input = "Real content\nAvailable tools: Read, Write, Edit, Bash\nMore content";
    expect(sanitizeContent(input)).toBe("Real content\n\nMore content");
  });
});

describe("isLowQualityContent", () => {
  it("detects short content as low quality", () => {
    expect(isLowQualityContent("YES")).toBe(true);
    expect(isLowQualityContent("OK")).toBe(true);
    expect(isLowQualityContent("はい")).toBe(true);
    expect(isLowQualityContent("")).toBe(true);
    expect(isLowQualityContent("  ")).toBe(true);
  });

  it("accepts content at or above minimum length", () => {
    expect(isLowQualityContent("a".repeat(MIN_CONTENT_LENGTH))).toBe(false);
    expect(isLowQualityContent("implement the auth module")).toBe(false);
    expect(isLowQualityContent("認証フローを実装してください")).toBe(false);
  });

  it("trims whitespace before checking length", () => {
    expect(isLowQualityContent("   YES   ")).toBe(true);
    const padded = "   " + "a".repeat(MIN_CONTENT_LENGTH) + "   ";
    expect(isLowQualityContent(padded)).toBe(false);
  });

  it("detects session boilerplate as low quality", () => {
    expect(isLowQualityContent("セッション開始チェックを実行します。")).toBe(true);
    expect(isLowQualityContent("セッション終了処理を開始します。")).toBe(true);
    expect(isLowQualityContent("セッション開始処理を実行します。")).toBe(true);
    expect(isLowQualityContent("セッション終了チェックを開始します。")).toBe(true);
  });

  it("detects kizuna operational boilerplate as low quality", () => {
    expect(isLowQualityContent("Kizuna の記憶を確認します。")).toBe(true);
    expect(isLowQualityContent("Kizuna のセットアップ状況を確認します。")).toBe(true);
  });

  it("detects interrupted request marker as low quality", () => {
    expect(isLowQualityContent("[Request interrupted by user]")).toBe(true);
    expect(isLowQualityContent("[Request interrupted]")).toBe(true);
  });

  it("detects English session boilerplate as low quality", () => {
    expect(isLowQualityContent("Session start check.")).toBe(true);
    expect(isLowQualityContent("Session end processing")).toBe(true);
    expect(isLowQualityContent("Checking Kizuna memories.")).toBe(true);
    expect(isLowQualityContent("Checking memories")).toBe(true);
    expect(isLowQualityContent("Checking session status")).toBe(true);
    expect(isLowQualityContent("Checking setup.")).toBe(true);
    expect(isLowQualityContent("Running session start hook.")).toBe(true);
    expect(isLowQualityContent("Running session end check")).toBe(true);
  });

  it("does not flag meaningful English content", () => {
    expect(isLowQualityContent("Checking the database schema for migration issues")).toBe(false);
    expect(isLowQualityContent("I'll check the session status and report back with details")).toBe(
      false,
    );
    expect(isLowQualityContent("Running session benchmarks to identify bottlenecks")).toBe(false);
    expect(isLowQualityContent("Let me review the authentication flow")).toBe(false);
  });

  it("does not flag real content that contains boilerplate substrings", () => {
    expect(
      isLowQualityContent("セッション開始チェックを実行します。以下の順序で確認します。"),
    ).toBe(false);
    expect(isLowQualityContent("Kizuna の記憶を確認します。前回の作業内容は以下の通りです。")).toBe(
      false,
    );
  });

  it("detects skill definition text as low quality", () => {
    const skillDef = [
      "---",
      "name: session-start",
      "description: セッション開始時のプロジェクト状況確認。",
      "---",
      "",
      "## When to Use",
      "",
      "- 新しいセッションを開始するとき",
    ].join("\n");
    expect(isLowQualityContent(skillDef)).toBe(true);
  });

  it("detects recap skill definition as low quality", () => {
    const recapSkill = [
      "---",
      "name: recap",
      "description: 別プロジェクトの直近セッション履歴を取り込む。",
      "---",
      "",
      "## When to Use",
      "",
      "- 別チーム・別プロジェクトの直近セッション内容を把握したいとき",
    ].join("\n");
    expect(isLowQualityContent(recapSkill)).toBe(true);
  });

  it("detects skill definition without frontmatter (actual DB format)", () => {
    const skillWithoutFrontmatter = [
      "## When to Use",
      "",
      "- セッションを終了するとき",
      "- ユーザーから「セッション終了」等の指示を受けたとき",
      "",
      "## Steps",
      "",
      "1. **未コミット変更の確認**",
      "",
      "   ```bash",
      "   git status --short",
      "   ```",
    ].join("\n");
    expect(isLowQualityContent(skillWithoutFrontmatter)).toBe(true);
  });

  it("detects session-start skill definition without frontmatter", () => {
    const sessionStart = [
      "## When to Use",
      "",
      "- 新しいセッションを開始するとき",
      "",
      "## Steps",
      "",
      "1. **Git 状態の確認**",
    ].join("\n");
    expect(isLowQualityContent(sessionStart)).toBe(true);
  });

  it("detects English skill definition with How to Use section", () => {
    const englishSkill = [
      "## When to Use",
      "",
      "- When starting a new session",
      "",
      "## How to Use",
      "",
      "Run `/session-start` at the beginning of each session.",
    ].join("\n");
    expect(isLowQualityContent(englishSkill)).toBe(true);
  });

  it("does not flag content that merely mentions 'When to Use'", () => {
    expect(isLowQualityContent("## When to Use this feature in production")).toBe(false);
    expect(
      isLowQualityContent(
        "この機能の使い方を説明します。When to Use セクションを参照してください。",
      ),
    ).toBe(false);
  });

  it("detects /do-issue style skill template with ## Autonomy section", () => {
    const doIssueTemplate = [
      "## Autonomy",
      "",
      "このスキルはすべてのステップを **承認なしで自律実行** する。",
      "コミット、プッシュ、PR 作成を含め、ユーザーへの確認待ちは行わない。",
      "",
      "## Steps",
      "",
      "### 1. Issue 読み込みとブランチ作成",
      "",
      "```bash",
      "gh issue view 153",
      "```",
    ].join("\n");
    expect(isLowQualityContent(doIssueTemplate)).toBe(true);
  });

  it("detects skill template fragment with ## Input + ## Autonomy", () => {
    const fragment = [
      "## Input",
      "",
      "- `153` — GitHub Issue 番号（例: `114`）",
      "",
      "## Autonomy",
      "",
      "このスキルはすべてのステップを承認なしで自律実行する。",
    ].join("\n");
    expect(isLowQualityContent(fragment)).toBe(true);
  });

  it("detects skill template fragment with ## Steps + ## Decision Rules", () => {
    const fragment = [
      "## Steps",
      "",
      "### 1. Issue 読み込みとブランチ作成",
      "",
      "```bash",
      "gh issue view 153",
      "```",
      "",
      "## Decision Rules",
      "",
      "- Issue のスコープが明らかに大きすぎる場合、着手前にユーザーに確認する",
    ].join("\n");
    expect(isLowQualityContent(fragment)).toBe(true);
  });

  it("detects context continuation header", () => {
    const continuationHeader = [
      "This session is being continued from a previous conversation. Here is a summary of that conversation:",
      "",
      "The user was working on implementing authentication flow for the frontend.",
      "They completed the login page and were starting on the signup flow.",
    ].join("\n");
    expect(isLowQualityContent(continuationHeader)).toBe(true);
  });

  it("detects context continuation header variant (context window limit)", () => {
    const continuationVariant =
      "This session is being continued from a previous conversation that may have been interrupted by a context window limit. IMPORTANT: Before starting any work, review the conversation summary below.";
    expect(isLowQualityContent(continuationVariant)).toBe(true);
  });

  it("does not flag engineering content that mentions 'steps' or 'decision'", () => {
    expect(
      isLowQualityContent(
        "The migration has 3 steps: first create the table, then migrate data, finally drop the old column.",
      ),
    ).toBe(false);
    expect(
      isLowQualityContent(
        "## Steps to reproduce\n\n1. Click login\n2. Enter credentials\n3. Submit form",
      ),
    ).toBe(false);
    expect(
      isLowQualityContent("We need to make a decision about the authentication provider."),
    ).toBe(false);
  });

  it("does not flag content that mentions 'autonomy' in a discussion context", () => {
    expect(
      isLowQualityContent(
        "The agent should have some level of autonomy when handling routine tasks.",
      ),
    ).toBe(false);
  });

  it("does not flag content that mentions 'continued' in a discussion context", () => {
    expect(
      isLowQualityContent("The discussion continued with a review of the database schema changes."),
    ).toBe(false);
  });

  it("does not flag content that discusses skill template design mid-chunk", () => {
    const discussion = [
      "I designed a new skill template. It has the following sections:",
      "",
      "## Autonomy",
      "The skill runs without approval.",
      "",
      "## Steps",
      "Step 1: Do this",
    ].join("\n");
    expect(isLowQualityContent(discussion)).toBe(false);
  });

  it("does not flag engineering doc with ## Steps + ## Decision Rules mid-content", () => {
    const doc = [
      "Some project context about the migration plan.",
      "",
      "## Steps",
      "",
      "1. Create the table",
      "2. Migrate data",
      "",
      "## Decision Rules",
      "",
      "We decided to use approach A.",
    ].join("\n");
    expect(isLowQualityContent(doc)).toBe(false);
  });

  describe("user-defined noise patterns", () => {
    it("matches substring pattern", () => {
      expect(
        isLowQualityContent("This is a frontend-design skill template", ["frontend-design"]),
      ).toBe(true);
    });

    it("does not match when substring is absent", () => {
      expect(
        isLowQualityContent("This is a backend service implementation", ["frontend-design"]),
      ).toBe(false);
    });

    it("matches regex pattern starting with ^", () => {
      expect(
        isLowQualityContent("## Custom Skill Template\nSome content", [
          "^## Custom Skill Template",
        ]),
      ).toBe(true);
    });

    it("regex pattern with ^ only matches at start of trimmed content", () => {
      expect(
        isLowQualityContent("Some prefix ## Custom Skill Template", ["^## Custom Skill Template"]),
      ).toBe(false);
    });

    it("skips invalid regex with console.error warning", () => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(isLowQualityContent("Some valid content here", ["^[invalid"])).toBe(false);
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("invalid noise pattern regex"));
      errorSpy.mockRestore();
    });

    it("matches any of multiple user patterns", () => {
      expect(
        isLowQualityContent("Update Config Skill definition here", [
          "frontend-design",
          "Update Config Skill",
        ]),
      ).toBe(true);
    });

    it("still applies built-in patterns when user patterns are provided", () => {
      expect(isLowQualityContent("OK", ["frontend-design"])).toBe(true);
      expect(isLowQualityContent("セッション開始チェックを実行します。", ["frontend-design"])).toBe(
        true,
      );
    });

    it("works with empty user patterns array (no effect)", () => {
      expect(isLowQualityContent("Normal content that should pass", [])).toBe(false);
    });

    it("works when userPatterns is undefined (backward compatible)", () => {
      expect(isLowQualityContent("Normal content that should pass")).toBe(false);
      expect(isLowQualityContent("OK")).toBe(true);
    });
  });
});
