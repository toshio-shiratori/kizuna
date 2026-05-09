import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "../storage/database.js";
import { PluginManager } from "./plugin-manager.js";
import type { Plugin, Logger, ProjectConfig, RawChunk, SearchResult } from "../index.js";

let database: Database;
let dir: string;
const projectConfig: ProjectConfig = { id: "test-project" };

function createTestLogger(): Logger & { messages: string[] } {
  const messages: string[] = [];
  return {
    messages,
    debug(msg) {
      messages.push(`DEBUG: ${msg}`);
    },
    info(msg) {
      messages.push(`INFO: ${msg}`);
    },
    warn(msg) {
      messages.push(`WARN: ${msg}`);
    },
    error(msg) {
      messages.push(`ERROR: ${msg}`);
    },
  };
}

function minimalPlugin(overrides: Partial<Plugin> = {}): Plugin {
  return {
    name: "test-plugin",
    version: "1.0.0",
    ...overrides,
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "kizuna-plugin-mgr-test-"));
  database = new Database(join(dir, "test.db"));
});

afterEach(() => {
  database.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("PluginManager - registration", () => {
  it("registers a minimal plugin", () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(minimalPlugin());
    expect(manager.getPlugins()).toHaveLength(1);
    expect(manager.getPlugins()[0]!.plugin.name).toBe("test-plugin");
  });

  it("preserves registration order", () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(minimalPlugin({ name: "alpha", version: "1.0.0" }));
    manager.register(minimalPlugin({ name: "beta", version: "1.0.0" }));
    manager.register(minimalPlugin({ name: "gamma", version: "1.0.0" }));
    const names = manager.getPlugins().map((e) => e.plugin.name);
    expect(names).toEqual(["alpha", "beta", "gamma"]);
  });

  it("rejects duplicate plugin names", () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(minimalPlugin());
    expect(() => manager.register(minimalPlugin())).toThrow("already registered");
  });

  it("rejects plugins without name", () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    expect(() => manager.register({ name: "", version: "1.0.0" })).toThrow("must have a name");
  });

  it("rejects plugins without version", () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    expect(() => manager.register({ name: "test", version: "" })).toThrow("must have a version");
  });

  it("skips disabled plugins", () => {
    const logger = createTestLogger();
    const manager = new PluginManager({ db: database.db, projectConfig, logger });
    manager.register(minimalPlugin(), { enabled: false, options: {} });
    expect(manager.getPlugins()).toHaveLength(0);
    expect(logger.messages.some((m) => m.includes("disabled"))).toBe(true);
  });

  it("retrieves a plugin by name", () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(minimalPlugin({ name: "find-me" }));
    const entry = manager.getPlugin("find-me");
    expect(entry).toBeDefined();
    expect(entry!.plugin.name).toBe("find-me");
  });

  it("returns undefined for unknown plugin name", () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    expect(manager.getPlugin("nope")).toBeUndefined();
  });
});

describe("PluginManager - lifecycle", () => {
  it("calls init on initAll", async () => {
    const initFn = vi.fn();
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(minimalPlugin({ init: initFn }));
    await manager.initAll();
    expect(initFn).toHaveBeenCalledOnce();
    expect(manager.getPlugins()[0]!.initialized).toBe(true);
  });

  it("marks plugins without init as initialized", async () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(minimalPlugin());
    await manager.initAll();
    expect(manager.getPlugins()[0]!.initialized).toBe(true);
  });

  it("catches init errors and marks plugin as failed", async () => {
    const logger = createTestLogger();
    const manager = new PluginManager({ db: database.db, projectConfig, logger });
    manager.register(
      minimalPlugin({
        init() {
          throw new Error("init boom");
        },
      }),
    );
    await manager.initAll();
    const entry = manager.getPlugins()[0]!;
    expect(entry.initFailed).toBe(true);
    expect(entry.initialized).toBe(false);
    expect(logger.messages.some((m) => m.includes("init boom"))).toBe(true);
  });

  it("continues initializing other plugins when one fails", async () => {
    const initB = vi.fn();
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(
      minimalPlugin({
        name: "failing",
        init() {
          throw new Error("fail");
        },
      }),
    );
    manager.register(minimalPlugin({ name: "ok", init: initB }));
    await manager.initAll();
    expect(initB).toHaveBeenCalledOnce();
    expect(manager.getPlugin("ok")!.initialized).toBe(true);
  });

  it("calls shutdown on shutdownAll", async () => {
    const shutdownFn = vi.fn();
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(minimalPlugin({ shutdown: shutdownFn }));
    await manager.initAll();
    await manager.shutdownAll();
    expect(shutdownFn).toHaveBeenCalledOnce();
  });

  it("does not call shutdown on uninitialized plugins", async () => {
    const shutdownFn = vi.fn();
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(minimalPlugin({ shutdown: shutdownFn }));
    await manager.shutdownAll();
    expect(shutdownFn).not.toHaveBeenCalled();
  });

  it("shuts down in reverse order", async () => {
    const order: string[] = [];
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(
      minimalPlugin({
        name: "first",
        shutdown() {
          order.push("first");
        },
      }),
    );
    manager.register(
      minimalPlugin({
        name: "second",
        shutdown() {
          order.push("second");
        },
      }),
    );
    manager.register(
      minimalPlugin({
        name: "third",
        shutdown() {
          order.push("third");
        },
      }),
    );
    await manager.initAll();
    await manager.shutdownAll();
    expect(order).toEqual(["third", "second", "first"]);
  });

  it("catches shutdown errors and continues", async () => {
    const shutdownB = vi.fn();
    const logger = createTestLogger();
    const manager = new PluginManager({ db: database.db, projectConfig, logger });
    manager.register(
      minimalPlugin({
        name: "a",
        shutdown: shutdownB,
      }),
    );
    manager.register(
      minimalPlugin({
        name: "b",
        shutdown() {
          throw new Error("shutdown boom");
        },
      }),
    );
    await manager.initAll();
    await manager.shutdownAll();
    expect(shutdownB).toHaveBeenCalledOnce();
    expect(logger.messages.some((m) => m.includes("shutdown boom"))).toBe(true);
  });

  it("skips init for plugins with migration failures", async () => {
    const initFn = vi.fn();
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(
      minimalPlugin({
        init: initFn,
        migrations: () => [{ version: 1, description: "bad", up: "INVALID SQL STATEMENT" }],
      }),
    );
    await manager.initAll();
    expect(initFn).not.toHaveBeenCalled();
    expect(manager.getPlugins()[0]!.initFailed).toBe(true);
  });
});

describe("PluginManager - context", () => {
  it("provides correct config in context", () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    const customConfig = { enabled: true, options: { foo: "bar" } };
    manager.register(minimalPlugin(), customConfig);
    const entry = manager.getPlugins()[0]!;
    expect(entry.context.config).toEqual(customConfig);
  });

  it("provides correct projectConfig in context", () => {
    const config: ProjectConfig = { id: "my-project", displayName: "My Project" };
    const manager = new PluginManager({ db: database.db, projectConfig: config });
    manager.register(minimalPlugin());
    expect(manager.getPlugins()[0]!.context.projectConfig).toEqual(config);
  });

  it("provides a working logger in context", () => {
    const logger = createTestLogger();
    const manager = new PluginManager({ db: database.db, projectConfig, logger });
    manager.register(minimalPlugin({ name: "log-test" }));
    const ctx = manager.getPlugins()[0]!.context;
    ctx.logger.info("hello");
    ctx.logger.error("oops");
    expect(logger.messages).toContain("INFO: [plugin:log-test] hello");
    expect(logger.messages).toContain("ERROR: [plugin:log-test] oops");
  });

  it("provides a working storage in context", async () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(minimalPlugin());
    const ctx = manager.getPlugins()[0]!.context;
    await ctx.storage.set("key", "value");
    expect(await ctx.storage.get("key")).toBe("value");
  });

  it("provides the raw db handle in context", () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(minimalPlugin());
    const ctx = manager.getPlugins()[0]!.context;
    expect(ctx.db).toBe(database.db);
  });
});

describe("PluginManager - plugin storage isolation", () => {
  it("each plugin has isolated storage", async () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(minimalPlugin({ name: "plugin-a" }));
    manager.register(minimalPlugin({ name: "plugin-b" }));

    const ctxA = manager.getPlugin("plugin-a")!.context;
    const ctxB = manager.getPlugin("plugin-b")!.context;

    await ctxA.storage.set("key", "from-a");
    await ctxB.storage.set("key", "from-b");

    expect(await ctxA.storage.get("key")).toBe("from-a");
    expect(await ctxB.storage.get("key")).toBe("from-b");
  });
});

describe("PluginManager - migrations", () => {
  it("runs plugin migrations on register", () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(
      minimalPlugin({
        migrations: () => [
          {
            version: 1,
            description: "create test table",
            up: "CREATE TABLE test_plugin_table (id INTEGER PRIMARY KEY, data TEXT);",
          },
        ],
      }),
    );

    const row = database.db
      .prepare("SELECT * FROM schema_versions WHERE component = ?")
      .get("test-plugin") as { component: string; version: number } | undefined;
    expect(row).toBeDefined();
    expect(row!.version).toBe(1);

    const tableExists = database.db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='test_plugin_table'")
      .get();
    expect(tableExists).toBeDefined();
  });

  it("runs multiple migrations in version order", () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(
      minimalPlugin({
        migrations: () => [
          {
            version: 2,
            description: "add column",
            up: "ALTER TABLE mig_test ADD COLUMN extra TEXT;",
          },
          {
            version: 1,
            description: "create table",
            up: "CREATE TABLE mig_test (id INTEGER PRIMARY KEY);",
          },
        ],
      }),
    );

    const versions = database.db
      .prepare("SELECT version FROM schema_versions WHERE component = ? ORDER BY version")
      .all("test-plugin") as { version: number }[];
    expect(versions.map((r) => r.version)).toEqual([1, 2]);
  });

  it("is idempotent — re-registering with same migrations does not fail", () => {
    const migrations = () => [
      {
        version: 1,
        description: "create table",
        up: "CREATE TABLE IF NOT EXISTS idem_test (id INTEGER PRIMARY KEY);",
      },
    ];

    const manager1 = new PluginManager({ db: database.db, projectConfig });
    manager1.register(minimalPlugin({ migrations }));

    const manager2 = new PluginManager({ db: database.db, projectConfig });
    expect(() => manager2.register(minimalPlugin({ migrations }))).not.toThrow();
  });

  it("marks plugin as initFailed on bad migration SQL", () => {
    const logger = createTestLogger();
    const manager = new PluginManager({ db: database.db, projectConfig, logger });
    manager.register(
      minimalPlugin({
        migrations: () => [{ version: 1, description: "bad sql", up: "THIS IS NOT SQL" }],
      }),
    );
    const entry = manager.getPlugins()[0]!;
    expect(entry.initFailed).toBe(true);

    const applied = database.db
      .prepare("SELECT * FROM schema_versions WHERE component = ?")
      .all("test-plugin");
    expect(applied).toHaveLength(0);
  });

  it("does not affect other plugins when migration fails", () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(
      minimalPlugin({
        name: "bad-migrator",
        migrations: () => [{ version: 1, description: "bad", up: "NOPE" }],
      }),
    );
    manager.register(
      minimalPlugin({
        name: "good-plugin",
        migrations: () => [
          {
            version: 1,
            description: "ok",
            up: "CREATE TABLE good_table (id INTEGER PRIMARY KEY);",
          },
        ],
      }),
    );

    expect(manager.getPlugin("bad-migrator")!.initFailed).toBe(true);
    expect(manager.getPlugin("good-plugin")!.initFailed).toBe(false);

    const goodMigration = database.db
      .prepare("SELECT * FROM schema_versions WHERE component = ?")
      .get("good-plugin");
    expect(goodMigration).toBeDefined();
  });
});

describe("PluginManager - hook runners", () => {
  const testChunk: RawChunk = {
    sessionId: "s1",
    turnIndex: 0,
    role: "user",
    content: "test content",
    metadata: {},
  };

  it("runBeforeCapture chains plugins in order", async () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(
      minimalPlugin({
        name: "plugin-a",
        beforeCapture(chunk) {
          return { ...chunk, content: chunk.content + " [A]" };
        },
      }),
    );
    manager.register(
      minimalPlugin({
        name: "plugin-b",
        beforeCapture(chunk) {
          return { ...chunk, content: chunk.content + " [B]" };
        },
      }),
    );
    await manager.initAll();

    const result = await manager.runBeforeCapture(testChunk);
    expect(result!.content).toBe("test content [A] [B]");
  });

  it("runBeforeCapture stops when plugin returns null", async () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(
      minimalPlugin({
        name: "plugin-a",
        beforeCapture() {
          return null;
        },
      }),
    );
    manager.register(
      minimalPlugin({
        name: "plugin-b",
        beforeCapture(chunk) {
          return { ...chunk, content: "should not reach" };
        },
      }),
    );
    await manager.initAll();

    const result = await manager.runBeforeCapture(testChunk);
    expect(result).toBeNull();
  });

  it("runBeforeCapture skips failed plugins", async () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(
      minimalPlugin({
        name: "failing",
        init() {
          throw new Error("init fail");
        },
        beforeCapture(chunk) {
          return { ...chunk, content: "should not run" };
        },
      }),
    );
    manager.register(
      minimalPlugin({
        name: "working",
        beforeCapture(chunk) {
          return { ...chunk, content: chunk.content + " [ok]" };
        },
      }),
    );
    await manager.initAll();

    const result = await manager.runBeforeCapture(testChunk);
    expect(result!.content).toBe("test content [ok]");
  });

  it("runBeforeCapture catches plugin errors and continues", async () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(
      minimalPlugin({
        name: "error-plugin",
        beforeCapture() {
          throw new Error("boom");
        },
      }),
    );
    await manager.initAll();

    const result = await manager.runBeforeCapture(testChunk);
    expect(result).toEqual(testChunk);
  });

  it("runBeforeSearch chains plugins in order", async () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(
      minimalPlugin({
        name: "search-modifier",
        beforeSearch(query) {
          return { ...query, limit: 5 };
        },
      }),
    );
    await manager.initAll();

    const result = await manager.runBeforeSearch({ text: "test", limit: 10 });
    expect(result.limit).toBe(5);
  });

  it("runAfterSearch chains plugins in order", async () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(
      minimalPlugin({
        name: "score-doubler",
        afterSearch(results) {
          return results.map((r) => ({ ...r, score: r.score * 2 }));
        },
      }),
    );
    await manager.initAll();

    const input: SearchResult[] = [
      {
        chunk: {
          id: 1,
          sessionId: "s1",
          turnIndex: 0,
          role: "user",
          content: "test",
          tokenCount: 10,
          importance: 5,
          createdAt: "2025-01-01T00:00:00Z",
          metadata: {},
        },
        score: 1.0,
      },
    ];

    const result = await manager.runAfterSearch(input);
    expect(result[0]!.score).toBe(2.0);
  });

  it("runEnrichContext adds context blocks", async () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(
      minimalPlugin({
        name: "enricher",
        enrichContext(injection) {
          return {
            ...injection,
            contextBlocks: [
              ...injection.contextBlocks,
              { source: "enricher", priority: 10, content: "extra info" },
            ],
          };
        },
      }),
    );
    await manager.initAll();

    const result = await manager.runEnrichContext({
      userPrompt: "test",
      chunks: [],
      contextBlocks: [],
    });
    expect(result.contextBlocks).toHaveLength(1);
    expect(result.contextBlocks[0]!.content).toBe("extra info");
  });
});

describe("PluginManager - token budget reservation", () => {
  it("returns empty map when no plugins have tokenBudget", () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(minimalPlugin());
    expect(manager.getReservedTokenBudgets().size).toBe(0);
    expect(manager.getTotalReservedTokens()).toBe(0);
  });

  it("returns budgets for plugins with tokenBudget", async () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(minimalPlugin({ name: "plugin-a", tokenBudget: 300 }));
    manager.register(minimalPlugin({ name: "plugin-b", tokenBudget: 500 }));
    await manager.initAll();

    const budgets = manager.getReservedTokenBudgets();
    expect(budgets.get("plugin-a")).toBe(300);
    expect(budgets.get("plugin-b")).toBe(500);
    expect(manager.getTotalReservedTokens()).toBe(800);
  });

  it("ignores uninitialized or failed plugins", async () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(
      minimalPlugin({
        name: "good-plugin",
        tokenBudget: 300,
      }),
    );
    manager.register(
      minimalPlugin({
        name: "bad-plugin",
        tokenBudget: 500,
        init() {
          throw new Error("init fail");
        },
      }),
    );
    await manager.initAll();

    expect(manager.getTotalReservedTokens()).toBe(300);
  });

  it("scaleTokenBudgets returns totalReserved when within budget", async () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(minimalPlugin({ name: "plugin-a", tokenBudget: 300 }));
    manager.register(minimalPlugin({ name: "plugin-b", tokenBudget: 200 }));
    await manager.initAll();

    expect(manager.scaleTokenBudgets(2000)).toBe(500);
  });

  it("scaleTokenBudgets caps at 80% and warns when overcommitted", async () => {
    const logger = createTestLogger();
    const manager = new PluginManager({ db: database.db, projectConfig, logger });
    manager.register(minimalPlugin({ name: "plugin-a", tokenBudget: 1500 }));
    manager.register(minimalPlugin({ name: "plugin-b", tokenBudget: 1500 }));
    await manager.initAll();

    const scaled = manager.scaleTokenBudgets(2000);
    expect(scaled).toBe(1600);
    expect(logger.messages.some((m) => m.includes("WARN") && m.includes("exceed"))).toBe(true);
  });

  it("scaleTokenBudgets returns 0 when no plugins have tokenBudget", () => {
    const manager = new PluginManager({ db: database.db, projectConfig });
    manager.register(minimalPlugin());
    expect(manager.scaleTokenBudgets(2000)).toBe(0);
  });
});
