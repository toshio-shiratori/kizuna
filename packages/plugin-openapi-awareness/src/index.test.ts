import { describe, it, expect, beforeEach } from "vitest";
import type { ContextInjection, PluginContext, PluginConfig, Logger, Plugin } from "@kizuna/core";
import { createOpenAPIAwareness } from "./index.js";
import { parseEndpoints, type EndpointInfo } from "./parser.js";
import { matchEndpoints } from "./matcher.js";
import { formatEndpoints } from "./formatter.js";
import { join } from "node:path";

function runEnrichContext(
  plugin: Plugin,
  injection: ContextInjection,
  ctx: PluginContext,
): ContextInjection {
  return plugin.enrichContext!(injection, ctx) as ContextInjection;
}

function makeContext(options: Record<string, unknown> = {}): PluginContext & {
  logMessages: Array<{ level: string; message: string; meta?: Record<string, unknown> }>;
} {
  const logMessages: Array<{ level: string; message: string; meta?: Record<string, unknown> }> = [];
  const logger: Logger = {
    debug(msg, meta) {
      logMessages.push({ level: "debug", message: msg, meta });
    },
    info(msg, meta) {
      logMessages.push({ level: "info", message: msg, meta });
    },
    warn(msg, meta) {
      logMessages.push({ level: "warn", message: msg, meta });
    },
    error(msg, meta) {
      logMessages.push({ level: "error", message: msg, meta });
    },
  };
  const config: PluginConfig = { enabled: true, options };
  return {
    db: {},
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
    logMessages,
  };
}

function makeInjection(userPrompt: string): ContextInjection {
  return {
    userPrompt,
    chunks: [],
    contextBlocks: [],
  };
}

const SAMPLE_SPEC = {
  openapi: "3.0.3",
  info: { title: "Test API", version: "1.0.0" },
  paths: {
    "/api/v1/users": {
      get: {
        operationId: "getUsers",
        summary: "List all users",
        tags: ["Users"],
        parameters: [
          {
            name: "page",
            in: "query",
            required: false,
            description: "Page number",
            schema: { type: "integer" },
          },
        ],
        responses: {
          "200": { description: "OK" },
        },
      },
      post: {
        operationId: "createUser",
        summary: "Create a new user",
        tags: ["Users"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  name: { type: "string", description: "User name" },
                  email: { type: "string", description: "Email address" },
                },
                required: ["name", "email"],
              },
            },
          },
        },
        responses: {
          "201": { description: "Created" },
          "400": { description: "Bad Request" },
        },
      },
    },
    "/api/v1/transactions": {
      get: {
        operationId: "getTransactions",
        summary: "List transactions",
        description: "Retrieve transaction history with pagination",
        tags: ["Transactions"],
        parameters: [
          {
            name: "limit",
            in: "query",
            required: false,
            schema: { type: "integer" },
          },
        ],
        responses: {
          "200": { description: "OK" },
        },
      },
      post: {
        operationId: "createTransaction",
        summary: "Create a new transaction",
        tags: ["Transactions"],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  amount: { type: "number", description: "Transaction amount" },
                  toUserId: { type: "string", description: "Recipient user ID" },
                },
                required: ["amount", "toUserId"],
              },
            },
          },
        },
        responses: {
          "201": { description: "Created" },
        },
      },
    },
    "/api/v1/transactions/{id}": {
      get: {
        operationId: "getTransaction",
        summary: "Get transaction by ID",
        tags: ["Transactions"],
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
          },
        ],
        responses: {
          "200": { description: "OK" },
          "404": { description: "Not Found" },
        },
      },
    },
    "/api/v1/health": {
      get: {
        operationId: "healthCheck",
        summary: "Health check",
        tags: ["Health"],
        responses: {
          "200": { description: "OK" },
        },
      },
    },
  },
};

describe("parseEndpoints", () => {
  it("parses all endpoints from spec", () => {
    const endpoints = parseEndpoints(SAMPLE_SPEC);
    expect(endpoints).toHaveLength(6);
  });

  it("extracts path and method", () => {
    const endpoints = parseEndpoints(SAMPLE_SPEC);
    const getUsers = endpoints.find((e) => e.path === "/api/v1/users" && e.method === "GET");
    expect(getUsers).toBeDefined();
    expect(getUsers!.operationId).toBe("getUsers");
  });

  it("extracts parameters", () => {
    const endpoints = parseEndpoints(SAMPLE_SPEC);
    const getUsers = endpoints.find((e) => e.operationId === "getUsers");
    expect(getUsers!.parameters).toHaveLength(1);
    expect(getUsers!.parameters[0]!.name).toBe("page");
    expect(getUsers!.parameters[0]!.in).toBe("query");
  });

  it("extracts request body properties", () => {
    const endpoints = parseEndpoints(SAMPLE_SPEC);
    const createUser = endpoints.find((e) => e.operationId === "createUser");
    expect(createUser!.requestBody).toBeDefined();
    expect(createUser!.requestBody!.properties).toHaveLength(2);
    expect(createUser!.requestBody!.properties[0]!.name).toBe("name");
    expect(createUser!.requestBody!.properties[0]!.required).toBe(true);
  });

  it("extracts responses", () => {
    const endpoints = parseEndpoints(SAMPLE_SPEC);
    const createUser = endpoints.find((e) => e.operationId === "createUser");
    expect(createUser!.responses).toHaveLength(2);
    expect(createUser!.responses[0]!.status).toBe("201");
  });

  it("handles spec with no paths", () => {
    const endpoints = parseEndpoints({ paths: {} });
    expect(endpoints).toHaveLength(0);
  });

  it("handles spec with undefined paths", () => {
    const endpoints = parseEndpoints({});
    expect(endpoints).toHaveLength(0);
  });
});

describe("matchEndpoints", () => {
  let endpoints: EndpointInfo[];

  beforeEach(() => {
    endpoints = parseEndpoints(SAMPLE_SPEC);
  });

  it("matches by path segment", () => {
    const results = matchEndpoints("transactions", endpoints, 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.endpoint.path.includes("transactions"))).toBe(true);
  });

  it("matches by tag", () => {
    const results = matchEndpoints("users", endpoints, 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.endpoint.tags.includes("Users"))).toBe(true);
  });

  it("matches by operation ID", () => {
    const results = matchEndpoints("createTransaction", endpoints, 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.endpoint.operationId).toBe("createTransaction");
  });

  it("matches by summary keywords", () => {
    const results = matchEndpoints("health check", endpoints, 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]!.endpoint.operationId).toBe("healthCheck");
  });

  it("returns empty for unrelated queries", () => {
    const results = matchEndpoints("completely unrelated topic", endpoints, 5);
    expect(results).toHaveLength(0);
  });

  it("respects maxResults", () => {
    const results = matchEndpoints("api", endpoints, 2);
    expect(results.length).toBeLessThanOrEqual(2);
  });

  it("sorts by score descending", () => {
    const results = matchEndpoints("transactions", endpoints, 10);
    for (let i = 1; i < results.length; i++) {
      expect(results[i]!.score).toBeLessThanOrEqual(results[i - 1]!.score);
    }
  });

  it("ignores very short tokens", () => {
    const results = matchEndpoints("a b c", endpoints, 5);
    expect(results).toHaveLength(0);
  });
});

describe("formatEndpoints", () => {
  let endpoints: EndpointInfo[];

  beforeEach(() => {
    endpoints = parseEndpoints(SAMPLE_SPEC);
  });

  it("formats matched endpoints as markdown", () => {
    const matches = matchEndpoints("users", endpoints, 2);
    const output = formatEndpoints(matches);
    expect(output).toContain("## Related API Endpoints");
    expect(output).toContain("/api/v1/users");
  });

  it("includes method and path in heading", () => {
    const matches = matchEndpoints("health", endpoints, 1);
    const output = formatEndpoints(matches);
    expect(output).toContain("### GET /api/v1/health");
  });

  it("includes parameters", () => {
    const matches = matchEndpoints("getUsers", endpoints, 1);
    const output = formatEndpoints(matches);
    expect(output).toContain("`page`");
    expect(output).toContain("query");
  });

  it("includes request body properties", () => {
    const matches = matchEndpoints("createUser", endpoints, 1);
    const output = formatEndpoints(matches);
    expect(output).toContain("Request Body");
    expect(output).toContain("`name`");
    expect(output).toContain("`email`");
  });

  it("includes responses", () => {
    const matches = matchEndpoints("createUser", endpoints, 1);
    const output = formatEndpoints(matches);
    expect(output).toContain("Responses");
    expect(output).toContain("201");
  });

  it("returns empty string for no matches", () => {
    const output = formatEndpoints([]);
    expect(output).toBe("");
  });
});

describe("createOpenAPIAwareness", () => {
  it("creates independent plugin instances", () => {
    const a = createOpenAPIAwareness();
    const b = createOpenAPIAwareness();
    expect(a).not.toBe(b);
    expect(a.name).toBe("@kizuna/plugin-openapi-awareness");
  });

  it("has correct metadata", () => {
    const plugin = createOpenAPIAwareness();
    expect(plugin.name).toBe("@kizuna/plugin-openapi-awareness");
    expect(plugin.version).toBe("0.0.0");
    expect(plugin.description).toBeDefined();
  });

  it("warns when no specPath configured", () => {
    const plugin = createOpenAPIAwareness();
    const ctx = makeContext({});
    plugin.init!(ctx);
    expect(ctx.logMessages.some((m) => m.level === "warn")).toBe(true);
  });

  it("logs error for invalid spec path", () => {
    const plugin = createOpenAPIAwareness();
    const ctx = makeContext({ specPath: "/nonexistent/spec.yaml" });
    plugin.init!(ctx);
    expect(ctx.logMessages.some((m) => m.level === "error")).toBe(true);
  });

  it("returns injection unchanged when not initialized", () => {
    const plugin = createOpenAPIAwareness();
    const ctx = makeContext({});
    const injection = makeInjection("test query");
    const result = runEnrichContext(plugin, injection, ctx);
    expect(result.contextBlocks).toHaveLength(0);
  });

  it("loads spec via specPath and enriches context", () => {
    const plugin = createOpenAPIAwareness();
    const specPath = join(import.meta.dirname, "__fixtures__", "sample-spec.yaml");
    const ctx = makeContext({ specPath });
    plugin.init!(ctx);

    const injection = makeInjection("Show me the transactions endpoint");
    const result = runEnrichContext(plugin, injection, ctx);
    expect(result.contextBlocks.length).toBeGreaterThan(0);
    expect(result.contextBlocks[0]!.source).toBe("@kizuna/plugin-openapi-awareness");
    expect(result.contextBlocks[0]!.content).toContain("transactions");
  });

  it("loads spec via specPaths array", () => {
    const plugin = createOpenAPIAwareness();
    const specPath = join(import.meta.dirname, "__fixtures__", "sample-spec.yaml");
    const ctx = makeContext({ specPaths: [specPath] });
    plugin.init!(ctx);

    const injection = makeInjection("transactions");
    const result = runEnrichContext(plugin, injection, ctx);
    expect(result.contextBlocks.length).toBeGreaterThan(0);
  });

  it("merges endpoints from multiple specs", () => {
    const plugin = createOpenAPIAwareness();
    const specPath = join(import.meta.dirname, "__fixtures__", "sample-spec.yaml");
    const ctx = makeContext({ specPaths: [specPath, specPath] });
    plugin.init!(ctx);
    expect(ctx.logMessages.filter((m) => m.level === "info")).toHaveLength(2);
  });

  it("skips invalid paths in specPaths without failing", () => {
    const plugin = createOpenAPIAwareness();
    const validPath = join(import.meta.dirname, "__fixtures__", "sample-spec.yaml");
    const ctx = makeContext({ specPaths: ["/nonexistent.yaml", validPath] });
    plugin.init!(ctx);

    expect(ctx.logMessages.some((m) => m.level === "error")).toBe(true);
    const injection = makeInjection("transactions");
    const result = runEnrichContext(plugin, injection, ctx);
    expect(result.contextBlocks.length).toBeGreaterThan(0);
  });

  it("deduplicates specPath if already in specPaths", () => {
    const plugin = createOpenAPIAwareness();
    const specPath = join(import.meta.dirname, "__fixtures__", "sample-spec.yaml");
    const ctx = makeContext({ specPath, specPaths: [specPath] });
    plugin.init!(ctx);
    expect(ctx.logMessages.filter((m) => m.level === "info")).toHaveLength(1);
  });

  it("does not add context block when no match", () => {
    const plugin = createOpenAPIAwareness();
    const specPath = join(import.meta.dirname, "__fixtures__", "sample-spec.yaml");
    const ctx = makeContext({ specPath });
    plugin.init!(ctx);

    const injection = makeInjection("completely unrelated weather forecast");
    const result = runEnrichContext(plugin, injection, ctx);
    expect(result.contextBlocks).toHaveLength(0);
  });

  it("respects maxResults option", () => {
    const plugin = createOpenAPIAwareness();
    const specPath = join(import.meta.dirname, "__fixtures__", "sample-spec.yaml");
    const ctx = makeContext({ specPath, maxResults: 1 });
    plugin.init!(ctx);

    const injection = makeInjection("api users transactions");
    const result = runEnrichContext(plugin, injection, ctx);
    expect(result.contextBlocks.length).toBeLessThanOrEqual(1);
  });

  it("preserves existing context blocks", () => {
    const plugin = createOpenAPIAwareness();
    const specPath = join(import.meta.dirname, "__fixtures__", "sample-spec.yaml");
    const ctx = makeContext({ specPath });
    plugin.init!(ctx);

    const injection = makeInjection("transactions");
    injection.contextBlocks = [{ source: "other-plugin", priority: 100, content: "existing" }];
    const result = runEnrichContext(plugin, injection, ctx);
    expect(result.contextBlocks.length).toBeGreaterThanOrEqual(2);
    expect(result.contextBlocks[0]!.source).toBe("other-plugin");
  });

  it("isolates state between instances", () => {
    const pluginA = createOpenAPIAwareness();
    const pluginB = createOpenAPIAwareness();
    const specPath = join(import.meta.dirname, "__fixtures__", "sample-spec.yaml");

    pluginA.init!(makeContext({ specPath }));
    // pluginB is not initialized

    const injection = makeInjection("transactions");
    const ctxA = makeContext({ specPath });
    const ctxB = makeContext({});

    const resultA = runEnrichContext(pluginA, injection, ctxA);
    const resultB = runEnrichContext(pluginB, injection, ctxB);

    expect(resultA.contextBlocks.length).toBeGreaterThan(0);
    expect(resultB.contextBlocks).toHaveLength(0);
  });
});
