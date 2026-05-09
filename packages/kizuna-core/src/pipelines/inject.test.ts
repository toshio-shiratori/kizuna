import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "../storage/database.js";
import { PluginManager } from "../plugin/plugin-manager.js";
import type { SearchResult, Plugin } from "../index.js";
import { formatContext, injectMemory } from "./inject.js";

// ─── formatContext Tests ─────────────────────────────────

describe("formatContext", () => {
  function makeResult(
    content: string,
    overrides: Partial<{
      role: "user" | "assistant";
      createdAt: string;
      importance: number;
      score: number;
    }> = {},
  ): SearchResult {
    return {
      chunk: {
        id: 1,
        sessionId: "session-1",
        turnIndex: 0,
        role: overrides.role ?? "assistant",
        content,
        tokenCount: 0,
        importance: overrides.importance ?? 5,
        createdAt: overrides.createdAt ?? "2025-06-01T10:00:00.000Z",
        metadata: {},
      },
      score: overrides.score ?? 1.0,
    };
  }

  it("returns empty for no results", () => {
    const result = formatContext([], 2000);
    expect(result.context).toBe("");
    expect(result.chunksUsed).toBe(0);
    expect(result.tokensUsed).toBe(0);
  });

  it("formats a single result with attribution instruction", () => {
    const results = [makeResult("Authentication uses JWT tokens.")];
    const result = formatContext(results, 2000);

    expect(result.context).toContain("## Relevant Memories");
    expect(result.context).toContain("[2025-06-01] assistant");
    expect(result.context).toContain("Authentication uses JWT tokens.");
    expect(result.context).toContain("which memories you considered");
    expect(result.chunksUsed).toBe(1);
    expect(result.tokensUsed).toBeGreaterThan(0);
  });

  it("formats multiple results with separators", () => {
    const results = [
      makeResult("First memory.", { createdAt: "2025-06-02T00:00:00.000Z" }),
      makeResult("Second memory.", { role: "user", createdAt: "2025-06-01T00:00:00.000Z" }),
    ];
    const result = formatContext(results, 2000);

    expect(result.context).toContain("First memory.");
    expect(result.context).toContain("Second memory.");
    expect(result.context).toContain("---");
    expect(result.chunksUsed).toBe(2);
  });

  it("respects token budget by truncating results", () => {
    const longContent = "x".repeat(500);
    const results = [makeResult(longContent), makeResult(longContent), makeResult(longContent)];

    const smallBudget = 200;
    const result = formatContext(results, smallBudget);

    expect(result.chunksUsed).toBeLessThan(3);
    expect(result.tokensUsed).toBeLessThanOrEqual(smallBudget);
  });

  it("returns empty when budget is too small for even the header", () => {
    const results = [makeResult("short")];
    const result = formatContext(results, 1);

    expect(result.context).toBe("");
    expect(result.chunksUsed).toBe(0);
  });

  it("returns empty when budget fits header but not any chunk", () => {
    const longContent = "x".repeat(1000);
    const results = [makeResult(longContent)];
    const headerOnlyBudget = 10;
    const result = formatContext(results, headerOnlyBudget);

    expect(result.context).toBe("");
    expect(result.chunksUsed).toBe(0);
  });

  it("includes date from createdAt in block header", () => {
    const results = [makeResult("content", { createdAt: "2025-12-25T15:30:00.000Z" })];
    const result = formatContext(results, 2000);
    expect(result.context).toContain("[2025-12-25]");
  });

  it("includes role in block header", () => {
    const results = [makeResult("question?", { role: "user" })];
    const result = formatContext(results, 2000);
    expect(result.context).toContain("user");
  });

  it("handles Japanese content within budget", () => {
    const results = [makeResult("SQLiteでデータベース接続を実装しました。")];
    const result = formatContext(results, 2000);

    expect(result.context).toContain("SQLiteでデータベース接続を実装しました。");
    expect(result.chunksUsed).toBe(1);
    expect(result.tokensUsed).toBeGreaterThan(0);
  });

  it("omits attribution instruction when budget is tight", () => {
    const results = [makeResult("short")];
    const withAttribution = formatContext(results, 2000);
    expect(withAttribution.context).toContain("which memories you considered");

    const tightBudget = withAttribution.tokensUsed - 5;
    const withoutAttribution = formatContext(results, tightBudget);
    expect(withoutAttribution.context).not.toContain("which memories you considered");
    expect(withoutAttribution.chunksUsed).toBe(1);
  });
});

// ─── injectMemory Integration Tests ─────────────────────

describe("injectMemory", () => {
  let db: Database;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "kizuna-inject-test-"));
    db = new Database(join(tmpDir, "test.db"));

    db.insertSession({
      id: "session-1",
      projectId: "project-a",
      startedAt: "2025-06-01T00:00:00.000Z",
      endedAt: "2025-06-01T01:00:00.000Z",
      transcriptPath: null,
      metadata: {},
    });

    db.insertChunk({
      sessionId: "session-1",
      turnIndex: 0,
      role: "user",
      content: "How do I implement authentication in TypeScript?",
      metadata: {},
      importance: 7,
    });

    db.insertChunk({
      sessionId: "session-1",
      turnIndex: 1,
      role: "assistant",
      content:
        "You can use JWT tokens for authentication. Here is an example with Express middleware.",
      metadata: {},
      importance: 8,
    });

    db.insertChunk({
      sessionId: "session-1",
      turnIndex: 2,
      role: "user",
      content: "TypeScriptでデータベース接続を実装する方法を教えてください。",
      metadata: {},
      importance: 6,
    });
  });

  afterEach(() => {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns relevant context for a query", async () => {
    const result = await injectMemory(db, "authentication JWT");
    expect(result.context).toContain("authentication");
    expect(result.chunksUsed).toBeGreaterThan(0);
    expect(result.tokensUsed).toBeGreaterThan(0);
  });

  it("returns empty for empty prompt", async () => {
    const result = await injectMemory(db, "");
    expect(result.context).toBe("");
    expect(result.chunksUsed).toBe(0);
  });

  it("returns empty for whitespace-only prompt", async () => {
    const result = await injectMemory(db, "   ");
    expect(result.context).toBe("");
    expect(result.chunksUsed).toBe(0);
  });

  it("returns empty when no matches found", async () => {
    const result = await injectMemory(db, "xyznonexistent");
    expect(result.context).toBe("");
    expect(result.chunksUsed).toBe(0);
  });

  it("respects tokenBudget option", async () => {
    const small = await injectMemory(db, "TypeScript", { tokenBudget: 50 });
    const large = await injectMemory(db, "TypeScript", { tokenBudget: 5000 });
    expect(small.chunksUsed).toBeLessThanOrEqual(large.chunksUsed);
    expect(small.tokensUsed).toBeLessThanOrEqual(50);
  });

  it("respects maxResults option", async () => {
    const result = await injectMemory(db, "TypeScript", { maxResults: 1 });
    expect(result.chunksUsed).toBeLessThanOrEqual(1);
  });

  it("works with Japanese prompts", async () => {
    const result = await injectMemory(db, "データベース接続");
    expect(result.chunksUsed).toBeGreaterThan(0);
    expect(result.context).toContain("データベース");
  });

  it("includes enrichContext blocks from plugins", async () => {
    const pm = new PluginManager({ db: db.db, projectConfig: { id: "test" } });
    const plugin: Plugin = {
      name: "context-enricher",
      version: "1.0.0",
      enrichContext(injection) {
        return {
          ...injection,
          contextBlocks: [
            ...injection.contextBlocks,
            {
              source: "context-enricher",
              priority: 10,
              content: "## Extra Context\n\nThis is extra context from a plugin.",
            },
          ],
        };
      },
    };
    pm.register(plugin);
    await pm.initAll();

    const result = await injectMemory(db, "authentication", { pluginManager: pm });
    expect(result.context).toContain("Extra Context");
    expect(result.context).toContain("Relevant Memories");
  });

  it("continues injection when enrichContext plugin throws", async () => {
    const pm = new PluginManager({ db: db.db, projectConfig: { id: "test" } });
    pm.register({
      name: "error-plugin",
      version: "1.0.0",
      enrichContext() {
        throw new Error("enrich error");
      },
    });
    await pm.initAll();

    const result = await injectMemory(db, "authentication", { pluginManager: pm });
    expect(result.chunksUsed).toBeGreaterThan(0);
  });

  it("reserves token budget for plugins with tokenBudget", async () => {
    const pm = new PluginManager({ db: db.db, projectConfig: { id: "test" } });
    const pluginContent = "## API Info\n\n" + "x".repeat(300);
    const plugin: Plugin = {
      name: "api-enricher",
      version: "1.0.0",
      tokenBudget: 500,
      enrichContext(injection) {
        return {
          ...injection,
          contextBlocks: [
            ...injection.contextBlocks,
            { source: "api-enricher", priority: 10, content: pluginContent },
          ],
        };
      },
    };
    pm.register(plugin);
    await pm.initAll();

    const result = await injectMemory(db, "authentication", {
      pluginManager: pm,
      tokenBudget: 2000,
    });
    expect(result.context).toContain("API Info");
    expect(result.context).toContain("Relevant Memories");
    expect(result.tokensUsed).toBeLessThanOrEqual(2000);
  });

  it("plugin output fits when tokenBudget reserves space", async () => {
    for (let i = 0; i < 20; i++) {
      db.insertChunk({
        sessionId: "session-1",
        turnIndex: 10 + i,
        role: "assistant",
        content: "Long memory chunk content ".repeat(10) + ` chunk-${i}`,
        metadata: {},
        importance: 8,
      });
    }

    const pmWithout = new PluginManager({ db: db.db, projectConfig: { id: "test" } });
    const pluginContent = "## OpenAPI\n\nGET /api/users - returns user list";
    const pluginFactory = (): Plugin => ({
      name: "openapi",
      version: "1.0.0",
      tokenBudget: 200,
      enrichContext(injection) {
        return {
          ...injection,
          contextBlocks: [
            ...injection.contextBlocks,
            { source: "openapi", priority: 10, content: pluginContent },
          ],
        };
      },
    });

    pmWithout.register({ ...pluginFactory(), tokenBudget: undefined });
    await pmWithout.initAll();
    const withoutReservation = await injectMemory(db, "TypeScript authentication", {
      pluginManager: pmWithout,
      tokenBudget: 800,
    });

    const pmWith = new PluginManager({ db: db.db, projectConfig: { id: "test" } });
    pmWith.register(pluginFactory());
    await pmWith.initAll();
    const withReservation = await injectMemory(db, "TypeScript authentication", {
      pluginManager: pmWith,
      tokenBudget: 800,
    });

    expect(withReservation.context).toContain("OpenAPI");
    expect(withReservation.chunksUsed).toBeLessThanOrEqual(withoutReservation.chunksUsed);
  });

  it("handles overcommitted plugin budgets with proportional scaling", async () => {
    const pm = new PluginManager({ db: db.db, projectConfig: { id: "test" } });
    const plugin1: Plugin = {
      name: "plugin-a",
      version: "1.0.0",
      tokenBudget: 1500,
      enrichContext(injection) {
        return {
          ...injection,
          contextBlocks: [
            ...injection.contextBlocks,
            { source: "plugin-a", priority: 10, content: "Plugin A output" },
          ],
        };
      },
    };
    const plugin2: Plugin = {
      name: "plugin-b",
      version: "1.0.0",
      tokenBudget: 1500,
      enrichContext(injection) {
        return {
          ...injection,
          contextBlocks: [
            ...injection.contextBlocks,
            { source: "plugin-b", priority: 5, content: "Plugin B output" },
          ],
        };
      },
    };
    pm.register(plugin1);
    pm.register(plugin2);
    await pm.initAll();

    const result = await injectMemory(db, "authentication", {
      pluginManager: pm,
      tokenBudget: 2000,
    });

    expect(result.tokensUsed).toBeLessThanOrEqual(2000);
    expect(result.context).toContain("Plugin A output");
    expect(result.context).toContain("Plugin B output");
  });

  it("plugins without tokenBudget use remaining space as before", async () => {
    const pm = new PluginManager({ db: db.db, projectConfig: { id: "test" } });
    const plugin: Plugin = {
      name: "no-budget-plugin",
      version: "1.0.0",
      enrichContext(injection) {
        return {
          ...injection,
          contextBlocks: [
            ...injection.contextBlocks,
            { source: "no-budget-plugin", priority: 10, content: "No budget output" },
          ],
        };
      },
    };
    pm.register(plugin);
    await pm.initAll();

    const result = await injectMemory(db, "authentication", {
      pluginManager: pm,
      tokenBudget: 2000,
    });
    expect(result.context).toContain("No budget output");
    expect(result.context).toContain("Relevant Memories");
  });
});
