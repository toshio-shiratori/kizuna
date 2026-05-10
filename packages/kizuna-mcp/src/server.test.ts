import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { Database, PluginManager } from "@kizuna/core";
import { createServer } from "./server.js";
import type { KizunaMcpServerOptions } from "./server.js";

let tmpDir: string;
let dbPath: string;
let db: Database;
let client: Client;

async function setupClient(opts?: Partial<KizunaMcpServerOptions>) {
  const mcp = createServer({ dbPath, ...opts });
  client = new Client({ name: "test-client", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), mcp.connect(serverTransport)]);
  return client;
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "kizuna-mcp-test-"));
  dbPath = join(tmpDir, "memory.db");
  db = new Database(dbPath);
});

afterEach(async () => {
  db.close();
  if (client) {
    await client.close();
  }
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("MCP server tool listing", () => {
  it("lists all four core tools", async () => {
    await setupClient();
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name);
    expect(names).toContain("kizuna_search");
    expect(names).toContain("kizuna_save");
    expect(names).toContain("kizuna_list");
    expect(names).toContain("kizuna_delete");
  });
});

describe("kizuna_search", () => {
  it("returns empty when no data", async () => {
    await setupClient();
    const result = await client.callTool({ name: "kizuna_search", arguments: { query: "test" } });
    expect(result.content).toEqual([{ type: "text", text: "No memories found." }]);
  });

  it("finds stored chunks", async () => {
    db.insertSession({
      id: "s1",
      projectId: "test",
      startedAt: new Date().toISOString(),
      endedAt: null,
      transcriptPath: null,
      metadata: {},
    });
    db.insertChunk({
      sessionId: "s1",
      turnIndex: 0,
      role: "assistant",
      content: "TypeScript is a great programming language for building reliable applications",
      metadata: {},
      tokenCount: 10,
      importance: 5,
    });

    await setupClient();
    const result = await client.callTool({
      name: "kizuna_search",
      arguments: { query: "TypeScript programming" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain("TypeScript");
    expect(text).toContain("score:");
  });
});

describe("kizuna_save", () => {
  it("saves a chunk and returns confirmation", async () => {
    await setupClient();
    const result = await client.callTool({
      name: "kizuna_save",
      arguments: { content: "This is a test memory", role: "assistant" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain("Saved memory chunk");
    expect(text).toContain("id:");
  });

  it("creates session and chunk that can be searched", async () => {
    await setupClient();
    await client.callTool({
      name: "kizuna_save",
      arguments: { content: "Kizuna uses SQLite for persistent storage", role: "assistant" },
    });

    const searchResult = await client.callTool({
      name: "kizuna_search",
      arguments: { query: "SQLite storage" },
    });
    const text = (searchResult.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain("SQLite");
  });

  it("supports custom importance", async () => {
    await setupClient();
    const result = await client.callTool({
      name: "kizuna_save",
      arguments: { content: "Important note", importance: 9 },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain("Saved");
  });
});

describe("kizuna_list", () => {
  it("returns empty when no data", async () => {
    await setupClient();
    const result = await client.callTool({ name: "kizuna_list", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toBe("No chunks found.");
  });

  it("lists recent chunks", async () => {
    db.insertSession({
      id: "s1",
      projectId: "test",
      startedAt: new Date().toISOString(),
      endedAt: null,
      transcriptPath: null,
      metadata: {},
    });
    db.insertChunk({
      sessionId: "s1",
      turnIndex: 0,
      role: "user",
      content: "Hello world",
      metadata: {},
      tokenCount: 2,
      importance: 5,
    });
    db.insertChunk({
      sessionId: "s1",
      turnIndex: 1,
      role: "assistant",
      content: "Hi there",
      metadata: {},
      tokenCount: 2,
      importance: 5,
    });

    await setupClient();
    const result = await client.callTool({ name: "kizuna_list", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain("Hello world");
    expect(text).toContain("Hi there");
  });

  it("filters by session ID", async () => {
    db.insertSession({
      id: "s1",
      projectId: "test",
      startedAt: new Date().toISOString(),
      endedAt: null,
      transcriptPath: null,
      metadata: {},
    });
    db.insertSession({
      id: "s2",
      projectId: "test",
      startedAt: new Date().toISOString(),
      endedAt: null,
      transcriptPath: null,
      metadata: {},
    });
    db.insertChunk({
      sessionId: "s1",
      turnIndex: 0,
      role: "user",
      content: "Session one content",
      metadata: {},
      tokenCount: 3,
      importance: 5,
    });
    db.insertChunk({
      sessionId: "s2",
      turnIndex: 0,
      role: "user",
      content: "Session two content",
      metadata: {},
      tokenCount: 3,
      importance: 5,
    });

    await setupClient();
    const result = await client.callTool({ name: "kizuna_list", arguments: { sessionId: "s1" } });
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toContain("Session one");
    expect(text).not.toContain("Session two");
  });

  it("respects limit parameter", async () => {
    db.insertSession({
      id: "s1",
      projectId: "test",
      startedAt: new Date().toISOString(),
      endedAt: null,
      transcriptPath: null,
      metadata: {},
    });
    for (let i = 0; i < 5; i++) {
      db.insertChunk({
        sessionId: "s1",
        turnIndex: i,
        role: "user",
        content: `Chunk number ${i}`,
        metadata: {},
        tokenCount: 2,
        importance: 5,
      });
    }

    await setupClient();
    const result = await client.callTool({ name: "kizuna_list", arguments: { limit: 2 } });
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    const lines = text.split("\n").filter((l) => l.startsWith("- **#"));
    expect(lines.length).toBe(2);
  });
});

describe("kizuna_delete", () => {
  it("deletes chunks by IDs", async () => {
    db.insertSession({
      id: "s1",
      projectId: "test",
      startedAt: new Date().toISOString(),
      endedAt: null,
      transcriptPath: null,
      metadata: {},
    });
    const chunk = db.insertChunk({
      sessionId: "s1",
      turnIndex: 0,
      role: "user",
      content: "To be deleted",
      metadata: {},
      tokenCount: 3,
      importance: 5,
    });

    await setupClient();
    const result = await client.callTool({ name: "kizuna_delete", arguments: { ids: [chunk.id] } });
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toBe("Deleted 1 chunk(s).");

    expect(db.getChunk(chunk.id)).toBeNull();
  });

  it("handles non-existent IDs gracefully", async () => {
    await setupClient();
    const result = await client.callTool({ name: "kizuna_delete", arguments: { ids: [99999] } });
    const text = (result.content as Array<{ type: string; text: string }>)[0]!.text;
    expect(text).toBe("Deleted 0 chunk(s).");
  });
});

describe("MCP server with PluginManager", () => {
  it("passes pluginManager to search pipeline", async () => {
    const manager = new PluginManager({
      db: db.db,
      projectConfig: { id: "test" },
    });

    let searchHookCalled = false;
    manager.register({
      name: "test-search-plugin",
      version: "1.0.0",
      async afterSearch(results) {
        searchHookCalled = true;
        return results;
      },
    });
    await manager.initAll();

    db.insertSession({
      id: "s1",
      projectId: "test",
      startedAt: new Date().toISOString(),
      endedAt: null,
      transcriptPath: null,
      metadata: {},
    });
    db.insertChunk({
      sessionId: "s1",
      turnIndex: 0,
      role: "assistant",
      content: "TypeScript is a typed superset of JavaScript for building reliable applications",
      metadata: {},
      tokenCount: 10,
      importance: 5,
    });

    await setupClient({ pluginManager: manager });
    await client.callTool({ name: "kizuna_search", arguments: { query: "TypeScript" } });

    expect(searchHookCalled).toBe(true);
  });
});
