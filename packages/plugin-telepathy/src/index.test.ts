import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import BetterSqlite3 from "better-sqlite3";
import { Database } from "@kizuna/core";
import type { PluginContext, PluginConfig, Logger } from "@kizuna/core";
import {
  createTelepathy,
  telepathy,
  sendMessage,
  receiveMessages,
  hasTelepathyTable,
} from "./index.js";
import type { RepoReference } from "./index.js";

const PLUGIN_NAME = "@kizuna/plugin-telepathy";

// ─── Test Helpers ───────────────────────────────────────────

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "kizuna-telepathy-test-"));
}

function createTestDbWithTelepathy(dbPath: string): BetterSqlite3.Database {
  // Create a Kizuna database (for schema compatibility), then add telepathy table
  const kizunaDb = new Database(dbPath);
  kizunaDb.close();

  const db = new BetterSqlite3(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS telepathy_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  return db;
}

function makeContext(
  options: Record<string, unknown> = {},
  db?: BetterSqlite3.Database,
): PluginContext {
  const logger: Logger = {
    debug() {},
    info() {},
    warn() {},
    error() {},
  };
  const config: PluginConfig = { enabled: true, options };
  return {
    db: db ?? ({} as unknown),
    config,
    projectConfig: { id: "test-project" },
    logger,
    storage: {
      async get() {
        return null;
      },
      async set() {},
      async delete() {},
      async list() {
        return [];
      },
    },
  };
}

function makeContextWithLogger(
  options: Record<string, unknown> = {},
  db?: BetterSqlite3.Database,
): { ctx: PluginContext; warnings: string[]; debugs: string[] } {
  const warnings: string[] = [];
  const debugs: string[] = [];
  const logger: Logger = {
    debug(message: string) {
      debugs.push(message);
    },
    info() {},
    warn(message: string) {
      warnings.push(message);
    },
    error() {},
  };
  const config: PluginConfig = { enabled: true, options };
  return {
    ctx: {
      db: db ?? ({} as unknown),
      config,
      projectConfig: { id: "test-project" },
      logger,
      storage: {
        async get() {
          return null;
        },
        async set() {},
        async delete() {},
        async list() {
          return [];
        },
      },
    },
    warnings,
    debugs,
  };
}

// ─── Plugin Metadata ────────────────────────────────────────

describe("telepathy plugin", () => {
  it("has correct metadata", () => {
    expect(telepathy.name).toBe(PLUGIN_NAME);
    expect(telepathy.version).toBe("0.1.0");
    expect(telepathy.description).toBeDefined();
  });

  it("provides migration for telepathy_messages table", () => {
    const migrations = telepathy.migrations!();
    expect(migrations).toHaveLength(1);
    expect(migrations[0]!.version).toBe(1);
    expect(migrations[0]!.up).toContain("CREATE TABLE telepathy_messages");
  });

  it("provides two MCP tools", () => {
    const tools = telepathy.mcpTools!();
    expect(tools).toHaveLength(2);
    expect(tools[0]!.name).toBe("kizuna_telepathy_send");
    expect(tools[1]!.name).toBe("kizuna_telepathy_receive");
  });

  it("createTelepathy returns a fresh instance", () => {
    const a = createTelepathy();
    const b = createTelepathy();
    expect(a).not.toBe(b);
    expect(a.name).toBe(PLUGIN_NAME);
    expect(b.name).toBe(PLUGIN_NAME);
  });

  it("send tool has message in inputSchema", () => {
    const tools = telepathy.mcpTools!();
    const sendTool = tools[0]!;
    expect(sendTool.inputSchema).toHaveProperty("message");
  });

  it("receive tool has empty inputSchema", () => {
    const tools = telepathy.mcpTools!();
    const receiveTool = tools[1]!;
    expect(Object.keys(receiveTool.inputSchema)).toHaveLength(0);
  });
});

// ─── hasTelepathyTable ──────────────────────────────────────

describe("hasTelepathyTable", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns true when telepathy_messages table exists", () => {
    const dbPath = path.join(tmpDir, "with-table.db");
    const db = createTestDbWithTelepathy(dbPath);
    try {
      expect(hasTelepathyTable(db)).toBe(true);
    } finally {
      db.close();
    }
  });

  it("returns false when telepathy_messages table does not exist", () => {
    const dbPath = path.join(tmpDir, "without-table.db");
    const db = new BetterSqlite3(dbPath);
    try {
      expect(hasTelepathyTable(db)).toBe(false);
    } finally {
      db.close();
    }
  });

  it("returns false for a Kizuna DB without telepathy plugin", () => {
    const dbPath = path.join(tmpDir, "kizuna-only.db");
    const kizunaDb = new Database(dbPath);
    kizunaDb.close();

    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      expect(hasTelepathyTable(db)).toBe(false);
    } finally {
      db.close();
    }
  });
});

// ─── sendMessage ────────────────────────────────────────────

describe("sendMessage", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("inserts a message into telepathy_messages", () => {
    const dbPath = path.join(tmpDir, "send.db");
    const db = createTestDbWithTelepathy(dbPath);
    try {
      sendMessage(db, "Hello from project A");
      const row = db.prepare("SELECT message FROM telepathy_messages").get() as { message: string };
      expect(row.message).toBe("Hello from project A");
    } finally {
      db.close();
    }
  });

  it("overwrites previous message (at most one retained)", () => {
    const dbPath = path.join(tmpDir, "overwrite.db");
    const db = createTestDbWithTelepathy(dbPath);
    try {
      sendMessage(db, "First message");
      sendMessage(db, "Second message");

      const rows = db.prepare("SELECT message FROM telepathy_messages").all() as {
        message: string;
      }[];
      expect(rows).toHaveLength(1);
      expect(rows[0]!.message).toBe("Second message");
    } finally {
      db.close();
    }
  });

  it("sets created_at timestamp", () => {
    const dbPath = path.join(tmpDir, "timestamp.db");
    const db = createTestDbWithTelepathy(dbPath);
    try {
      sendMessage(db, "Timestamped message");
      const row = db.prepare("SELECT created_at FROM telepathy_messages").get() as {
        created_at: string;
      };
      expect(row.created_at).toBeDefined();
      // Should be a valid ISO-ish datetime string
      expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2}/);
    } finally {
      db.close();
    }
  });
});

// ─── receiveMessages ────────────────────────────────────────

describe("receiveMessages", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("receives messages from referenced databases", () => {
    const dbPathA = path.join(tmpDir, "project-a.db");
    const dbA = createTestDbWithTelepathy(dbPathA);
    sendMessage(dbA, "Message from project A");
    dbA.close();

    const logger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
    const refs: RepoReference[] = [{ name: "project-a", dbPath: dbPathA }];

    const messages = receiveMessages(refs, logger);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.source).toBe("project-a");
    expect(messages[0]!.message).toBe("Message from project A");
    expect(messages[0]!.createdAt).toBeDefined();
  });

  it("receives messages from multiple referenced databases", () => {
    const dbPathA = path.join(tmpDir, "project-a.db");
    const dbPathB = path.join(tmpDir, "project-b.db");

    const dbA = createTestDbWithTelepathy(dbPathA);
    sendMessage(dbA, "From A");
    dbA.close();

    const dbB = createTestDbWithTelepathy(dbPathB);
    sendMessage(dbB, "From B");
    dbB.close();

    const logger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
    const refs: RepoReference[] = [
      { name: "project-a", dbPath: dbPathA },
      { name: "project-b", dbPath: dbPathB },
    ];

    const messages = receiveMessages(refs, logger);
    expect(messages).toHaveLength(2);

    const sources = messages.map((m) => m.source);
    expect(sources).toContain("project-a");
    expect(sources).toContain("project-b");
  });

  it("skips references with missing database files", () => {
    const warnings: string[] = [];
    const logger: Logger = {
      debug() {},
      info() {},
      warn(msg: string) {
        warnings.push(msg);
      },
      error() {},
    };
    const refs: RepoReference[] = [
      { name: "missing", dbPath: path.join(tmpDir, "nonexistent.db") },
    ];

    const messages = receiveMessages(refs, logger);
    expect(messages).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('Skipping reference "missing"');
  });

  it("skips references without telepathy_messages table", () => {
    const dbPath = path.join(tmpDir, "no-telepathy.db");
    const kizunaDb = new Database(dbPath);
    kizunaDb.close();

    const debugs: string[] = [];
    const logger: Logger = {
      debug(msg: string) {
        debugs.push(msg);
      },
      info() {},
      warn() {},
      error() {},
    };
    const refs: RepoReference[] = [{ name: "no-telepathy", dbPath }];

    const messages = receiveMessages(refs, logger);
    expect(messages).toHaveLength(0);
    expect(debugs).toHaveLength(1);
    expect(debugs[0]).toContain("no telepathy_messages table");
  });

  it("skips references with empty telepathy_messages table", () => {
    const dbPath = path.join(tmpDir, "empty-telepathy.db");
    const db = createTestDbWithTelepathy(dbPath);
    // Table exists but no rows
    db.close();

    const logger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
    const refs: RepoReference[] = [{ name: "empty", dbPath }];

    const messages = receiveMessages(refs, logger);
    expect(messages).toHaveLength(0);
  });

  it("opens referenced databases in read-only mode", () => {
    const dbPath = path.join(tmpDir, "readonly-test.db");
    const db = createTestDbWithTelepathy(dbPath);
    sendMessage(db, "Read-only test");
    db.close();

    // Record file state before
    const contentBefore = fs.readFileSync(dbPath);

    const logger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
    const refs: RepoReference[] = [{ name: "readonly", dbPath }];

    const messages = receiveMessages(refs, logger);
    expect(messages).toHaveLength(1);

    // Verify file was not modified
    const contentAfter = fs.readFileSync(dbPath);
    expect(contentAfter.equals(contentBefore)).toBe(true);
  });

  it("handles corrupted database files gracefully", () => {
    const corruptPath = path.join(tmpDir, "corrupt.db");
    fs.writeFileSync(corruptPath, "not a sqlite database");

    const warnings: string[] = [];
    const debugs: string[] = [];
    const logger: Logger = {
      debug(msg: string) {
        debugs.push(msg);
      },
      info() {},
      warn(msg: string) {
        warnings.push(msg);
      },
      error() {},
    };
    const refs: RepoReference[] = [{ name: "corrupt", dbPath: corruptPath }];

    const messages = receiveMessages(refs, logger);
    expect(messages).toHaveLength(0);
    // Corrupted files may either throw on open (caught as warn) or
    // fail schema check (logged as debug). Either path is acceptable.
    expect(warnings.length + debugs.length).toBeGreaterThanOrEqual(1);
  });

  it("continues processing remaining references when one fails", () => {
    const dbPathGood = path.join(tmpDir, "good.db");
    const dbGood = createTestDbWithTelepathy(dbPathGood);
    sendMessage(dbGood, "Good message");
    dbGood.close();

    const warnings: string[] = [];
    const logger: Logger = {
      debug() {},
      info() {},
      warn(msg: string) {
        warnings.push(msg);
      },
      error() {},
    };
    const refs: RepoReference[] = [
      { name: "missing", dbPath: path.join(tmpDir, "nonexistent.db") },
      { name: "good", dbPath: dbPathGood },
    ];

    const messages = receiveMessages(refs, logger);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.source).toBe("good");
    expect(warnings).toHaveLength(1);
  });
});

// ─── MCP Tool: kizuna_telepathy_send ────────────────────────

describe("kizuna_telepathy_send tool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("sends a message and returns success", async () => {
    const dbPath = path.join(tmpDir, "send-tool.db");
    const db = createTestDbWithTelepathy(dbPath);

    const plugin = createTelepathy();
    const tools = plugin.mcpTools!();
    const sendTool = tools[0]!;

    const ctx = makeContext({}, db);
    const result = await sendTool.handler({ message: "Hello via MCP" }, ctx);

    expect(result.isError).toBeUndefined();
    const content = result.content as { ok: boolean; length: number };
    expect(content.ok).toBe(true);
    expect(content.length).toBe("Hello via MCP".length);

    // Verify in DB
    const row = db.prepare("SELECT message FROM telepathy_messages").get() as { message: string };
    expect(row.message).toBe("Hello via MCP");

    db.close();
  });

  it("returns error for missing message parameter", async () => {
    const dbPath = path.join(tmpDir, "send-error.db");
    const db = createTestDbWithTelepathy(dbPath);

    const plugin = createTelepathy();
    const tools = plugin.mcpTools!();
    const sendTool = tools[0]!;

    const ctx = makeContext({}, db);
    const result = await sendTool.handler({}, ctx);

    expect(result.isError).toBe(true);
    db.close();
  });

  it("overwrites previous message on subsequent send", async () => {
    const dbPath = path.join(tmpDir, "send-overwrite.db");
    const db = createTestDbWithTelepathy(dbPath);

    const plugin = createTelepathy();
    const tools = plugin.mcpTools!();
    const sendTool = tools[0]!;

    const ctx = makeContext({}, db);
    await sendTool.handler({ message: "First" }, ctx);
    await sendTool.handler({ message: "Second" }, ctx);

    const rows = db.prepare("SELECT message FROM telepathy_messages").all() as {
      message: string;
    }[];
    expect(rows).toHaveLength(1);
    expect(rows[0]!.message).toBe("Second");

    db.close();
  });
});

// ─── MCP Tool: kizuna_telepathy_receive ─────────────────────

describe("kizuna_telepathy_receive tool", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("receives messages from referenced projects", async () => {
    const dbPathRemote = path.join(tmpDir, "remote.db");
    const remoteDb = createTestDbWithTelepathy(dbPathRemote);
    sendMessage(remoteDb, "Remote telepathy message");
    remoteDb.close();

    const plugin = createTelepathy();
    const tools = plugin.mcpTools!();
    const receiveTool = tools[1]!;

    const ctx = makeContext({
      references: [{ name: "remote-project", dbPath: dbPathRemote }],
    });
    const result = await receiveTool.handler({}, ctx);

    expect(result.isError).toBeUndefined();
    const content = result.content as { messages: Array<{ source: string; message: string }> };
    expect(content.messages).toHaveLength(1);
    expect(content.messages[0]!.source).toBe("remote-project");
    expect(content.messages[0]!.message).toBe("Remote telepathy message");
  });

  it("returns note when no references configured", async () => {
    const plugin = createTelepathy();
    const tools = plugin.mcpTools!();
    const receiveTool = tools[1]!;

    const ctx = makeContext({});
    const result = await receiveTool.handler({}, ctx);

    expect(result.isError).toBeUndefined();
    const content = result.content as { messages: unknown[]; note: string };
    expect(content.messages).toHaveLength(0);
    expect(content.note).toContain("No references configured");
  });

  it("returns note when no messages found", async () => {
    const dbPath = path.join(tmpDir, "empty-remote.db");
    const db = createTestDbWithTelepathy(dbPath);
    db.close(); // Empty table

    const plugin = createTelepathy();
    const tools = plugin.mcpTools!();
    const receiveTool = tools[1]!;

    const ctx = makeContext({
      references: [{ name: "empty", dbPath }],
    });
    const result = await receiveTool.handler({}, ctx);

    const content = result.content as { messages: unknown[]; note: string };
    expect(content.messages).toHaveLength(0);
    expect(content.note).toContain("No telepathy messages found");
  });
});

// ─── Integration: send → receive across projects ────────────

describe("cross-project send and receive", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("project A sends, project B receives", async () => {
    // Project A sends a message
    const dbPathA = path.join(tmpDir, "project-a.db");
    const dbA = createTestDbWithTelepathy(dbPathA);

    const pluginA = createTelepathy();
    const toolsA = pluginA.mcpTools!();
    const sendTool = toolsA[0]!;

    const ctxA = makeContext({}, dbA);
    await sendTool.handler(
      { message: "Bug found in auth module. Fix: update token validation." },
      ctxA,
    );
    dbA.close();

    // Project B receives the message
    const pluginB = createTelepathy();
    const toolsB = pluginB.mcpTools!();
    const receiveTool = toolsB[1]!;

    const ctxB = makeContext({
      references: [{ name: "project-a", dbPath: dbPathA }],
    });
    const result = await receiveTool.handler({}, ctxB);

    const content = result.content as { messages: Array<{ source: string; message: string }> };
    expect(content.messages).toHaveLength(1);
    expect(content.messages[0]!.source).toBe("project-a");
    expect(content.messages[0]!.message).toContain("Bug found in auth module");
  });

  it("multiple projects send, one project receives all", async () => {
    // Project A sends
    const dbPathA = path.join(tmpDir, "frontend.db");
    const dbA = createTestDbWithTelepathy(dbPathA);
    sendMessage(dbA, "Frontend: Fixed login page styling");
    dbA.close();

    // Project B sends
    const dbPathB = path.join(tmpDir, "backend.db");
    const dbB = createTestDbWithTelepathy(dbPathB);
    sendMessage(dbB, "Backend: Updated auth endpoint");
    dbB.close();

    // Project C receives from both
    const pluginC = createTelepathy();
    const toolsC = pluginC.mcpTools!();
    const receiveTool = toolsC[1]!;

    const ctxC = makeContext({
      references: [
        { name: "frontend", dbPath: dbPathA },
        { name: "backend", dbPath: dbPathB },
      ],
    });
    const result = await receiveTool.handler({}, ctxC);

    const content = result.content as { messages: Array<{ source: string; message: string }> };
    expect(content.messages).toHaveLength(2);

    const sources = content.messages.map((m) => m.source);
    expect(sources).toContain("frontend");
    expect(sources).toContain("backend");
  });

  it("overwrite on send is visible to receiver", async () => {
    const dbPathA = path.join(tmpDir, "sender.db");
    const dbA = createTestDbWithTelepathy(dbPathA);

    // Send first message
    sendMessage(dbA, "Old context");
    // Overwrite with new message
    sendMessage(dbA, "New context");
    dbA.close();

    // Receiver sees only the latest
    const plugin = createTelepathy();
    const tools = plugin.mcpTools!();
    const receiveTool = tools[1]!;

    const ctx = makeContext({
      references: [{ name: "sender", dbPath: dbPathA }],
    });
    const result = await receiveTool.handler({}, ctx);

    const content = result.content as { messages: Array<{ message: string }> };
    expect(content.messages).toHaveLength(1);
    expect(content.messages[0]!.message).toBe("New context");
  });

  it("receiver handles mix of available and unavailable references", async () => {
    const dbPathGood = path.join(tmpDir, "available.db");
    const dbGood = createTestDbWithTelepathy(dbPathGood);
    sendMessage(dbGood, "Available message");
    dbGood.close();

    const { ctx, warnings } = makeContextWithLogger({
      references: [
        { name: "missing", dbPath: path.join(tmpDir, "nonexistent.db") },
        { name: "available", dbPath: dbPathGood },
      ],
    });

    const plugin = createTelepathy();
    const tools = plugin.mcpTools!();
    const receiveTool = tools[1]!;

    const result = await receiveTool.handler({}, ctx);

    const content = result.content as { messages: Array<{ source: string; message: string }> };
    expect(content.messages).toHaveLength(1);
    expect(content.messages[0]!.source).toBe("available");
    expect(warnings).toHaveLength(1);
  });
});
