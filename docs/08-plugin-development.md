# Plugin Development Guide

This guide walks you through creating a Kizuna plugin from scratch.

## Prerequisites

- Node.js >= 24
- pnpm
- A working Kizuna installation (`kizuna setup` has been run)

## Plugin Structure

A plugin is a standard npm package:

```
my-plugin/
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── src/
    ├── index.ts        # Plugin export
    └── index.test.ts   # Tests
```

## Step 1: Create the Package

```bash
mkdir my-plugin && cd my-plugin
pnpm init
```

Edit `package.json`:

```json
{
  "name": "kizuna-plugin-example",
  "version": "0.1.0",
  "type": "module",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist"],
  "scripts": {
    "build": "tsc -b",
    "test": "vitest run"
  },
  "peerDependencies": {
    "@kizuna/core": "^0.1.0"
  },
  "devDependencies": {
    "@kizuna/core": "^0.1.0",
    "typescript": "^5.8.0",
    "vitest": "^3.1.0"
  }
}
```

## Step 2: Implement the Plugin

There are two export styles. Choose the one that fits your plugin.

### Style A: Direct Export (Stateless Plugins)

Use when your plugin has no initialization state:

```typescript
// src/index.ts
import type { Plugin, RawChunk, PluginContext } from "@kizuna/core";

export const myPlugin: Plugin = {
  name: "kizuna-plugin-example",
  version: "0.1.0",
  description: "Example plugin",

  beforeCapture(chunk: RawChunk, ctx: PluginContext): RawChunk | null {
    // Modify or filter chunks before storage
    return chunk;
  },
};
```

### Style B: Factory Function (Stateful Plugins)

Use when your plugin needs initialization or closure state:

```typescript
// src/index.ts
import type { Plugin, StoredChunk, PluginContext } from "@kizuna/core";

export interface MyPluginOptions {
  threshold?: number;
}

export function createMyPlugin(options?: MyPluginOptions): Plugin {
  const threshold = options?.threshold ?? 10;
  let initialized = false;

  return {
    name: "kizuna-plugin-example",
    version: "0.1.0",
    description: "Example plugin with state",

    async init(ctx: PluginContext): Promise<void> {
      initialized = true;
      ctx.logger.info("Plugin initialized");
    },

    async shutdown(ctx: PluginContext): Promise<void> {
      initialized = false;
    },

    afterCapture(chunk: StoredChunk, ctx: PluginContext): void {
      if (chunk.content.length > threshold) {
        ctx.logger.info(`Captured chunk with ${chunk.content.length} chars`);
      }
    },
  };
}
```

The plugin loader resolves exports in this order:

1. **Factory function**: Any named export matching `createXxxPlugin` — called with `options` from `plugins.json`
2. **Direct export**: Any named export conforming to the `Plugin` interface

## Step 3: Available Hooks

Plugins can implement any combination of these hooks:

### Capture Pipeline

| Hook            | Signature                                    | Purpose                                                           |
| --------------- | -------------------------------------------- | ----------------------------------------------------------------- |
| `beforeCapture` | `(chunk: RawChunk, ctx) => RawChunk \| null` | Modify or filter chunks before storage. Return `null` to discard. |
| `afterCapture`  | `(chunk: StoredChunk, ctx) => void`          | React after a chunk is stored (e.g., build indexes).              |

### Search Pipeline

| Hook           | Signature                                          | Purpose                                      |
| -------------- | -------------------------------------------------- | -------------------------------------------- |
| `beforeSearch` | `(query: SearchQuery, ctx) => SearchQuery`         | Modify the search query (e.g., add filters). |
| `afterSearch`  | `(results: SearchResult[], ctx) => SearchResult[]` | Re-rank, filter, or annotate results.        |

### Inject Pipeline

| Hook            | Signature                                                | Purpose                                 |
| --------------- | -------------------------------------------------------- | --------------------------------------- |
| `enrichContext` | `(injection: ContextInjection, ctx) => ContextInjection` | Add context blocks to prompt injection. |

### Lifecycle

| Hook       | Signature       | Purpose                                            |
| ---------- | --------------- | -------------------------------------------------- |
| `init`     | `(ctx) => void` | One-time setup (e.g., create tables, load models). |
| `shutdown` | `(ctx) => void` | Cleanup (e.g., close connections).                 |

### Extensions

| Hook          | Signature                      | Purpose                                       |
| ------------- | ------------------------------ | --------------------------------------------- |
| `migrations`  | `() => Migration[]`            | Schema migrations for plugin-specific tables. |
| `mcpTools`    | `() => MCPToolDefinition[]`    | Register custom MCP tools.                    |
| `cliCommands` | `() => CLICommandDefinition[]` | Register custom CLI commands.                 |

## Step 3b: MCP Tools

Plugins can register custom MCP tools that are available via the Kizuna MCP server. This is useful for interactive features that the user or Claude invoke explicitly.

```typescript
import type { Plugin, MCPToolDefinition, MCPToolResult, PluginContext } from "@kizuna/core";

export function createMyPlugin(): Plugin {
  return {
    name: "kizuna-plugin-example",
    version: "0.1.0",

    mcpTools(): MCPToolDefinition[] {
      return [
        {
          name: "kizuna_example_action",
          description: "Perform an example action",
          inputSchema: {
            message: { type: "string", description: "The input message" },
          },
          async handler(args: unknown, ctx: PluginContext): Promise<MCPToolResult> {
            const { message } = args as { message: string };
            // Use ctx.db for database access
            return { content: { ok: true, received: message } };
          },
        },
        {
          name: "kizuna_example_query",
          description: "A tool with no input parameters",
          inputSchema: {},
          async handler(_args: unknown, ctx: PluginContext): Promise<MCPToolResult> {
            return { content: { status: "ready" } };
          },
        },
      ];
    },
  };
}
```

### inputSchema format

Each key in `inputSchema` is a property descriptor with `type` and optional `description`:

| Type        | Maps to       |
| ----------- | ------------- |
| `"string"`  | `z.string()`  |
| `"number"`  | `z.number()`  |
| `"boolean"` | `z.boolean()` |

Use `{}` for tools with no input parameters.

## Step 4: Token Budget

If your plugin adds content via `enrichContext`, declare a `tokenBudget` to reserve space in the injection pipeline:

```typescript
export const myPlugin: Plugin = {
  name: "kizuna-plugin-example",
  version: "0.1.0",
  tokenBudget: 500, // Reserve 500 tokens for this plugin's output

  enrichContext(injection, ctx) {
    injection.contextBlocks.push({
      source: this.name,
      priority: 10,
      content: "## My Plugin Context\n...",
    });
    return injection;
  },
};
```

Without a `tokenBudget`, your `enrichContext` output may be truncated if memory chunks consume the budget first.

## Step 5: Plugin Context

Every hook receives a `PluginContext`:

```typescript
interface PluginContext {
  readonly db: unknown; // Raw better-sqlite3 Database instance
  readonly config: PluginConfig;
  readonly projectConfig: ProjectConfig;
  readonly logger: Logger;
  readonly storage: PluginStorage;
}
```

### Key-Value Storage

Each plugin gets an isolated KV store backed by SQLite:

```typescript
async init(ctx: PluginContext): Promise<void> {
  // Store plugin-specific state
  await ctx.storage.set("lastRun", Date.now());

  // Retrieve later
  const lastRun = await ctx.storage.get<number>("lastRun");

  // List keys
  const keys = await ctx.storage.list("prefix:");

  // Delete
  await ctx.storage.delete("lastRun");
}
```

### Logger

Use the scoped logger instead of `console`:

```typescript
ctx.logger.info("Processing chunk", { chunkId: chunk.id });
ctx.logger.warn("Threshold exceeded");
ctx.logger.error("Failed to process", { error: err.message });
```

### Config

Access plugin options from `.kizuna/plugins.json`:

```typescript
const options = ctx.config.options as MyPluginOptions;
const threshold = options.threshold ?? 10;
```

## Step 6: Write Tests

Create mock contexts to test hooks in isolation:

```typescript
// src/index.test.ts
import { describe, it, expect } from "vitest";
import type { RawChunk, PluginContext, Logger } from "@kizuna/core";
import { myPlugin } from "./index.js";

function makeChunk(content: string): RawChunk {
  return {
    sessionId: "test-session",
    turnIndex: 0,
    role: "assistant",
    content,
    metadata: {},
  };
}

function makeContext(options: Record<string, unknown> = {}): PluginContext {
  const logs: Array<{ level: string; message: string }> = [];
  const logger: Logger = {
    debug(msg) {
      logs.push({ level: "debug", message: msg });
    },
    info(msg) {
      logs.push({ level: "info", message: msg });
    },
    warn(msg) {
      logs.push({ level: "warn", message: msg });
    },
    error(msg) {
      logs.push({ level: "error", message: msg });
    },
  };

  return {
    db: {},
    config: { enabled: true, options },
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

describe("myPlugin", () => {
  it("has correct metadata", () => {
    expect(myPlugin.name).toBe("kizuna-plugin-example");
  });

  it("passes through chunks in beforeCapture", () => {
    const chunk = makeChunk("test content");
    const result = myPlugin.beforeCapture!(chunk, makeContext());
    expect(result).toEqual(chunk);
  });
});
```

## Step 7: Configure the Plugin

Add the plugin to `.kizuna/plugins.json` in the target project:

```json
{
  "plugins": {
    "kizuna-plugin-example": {
      "enabled": true,
      "options": {
        "threshold": 20
      }
    }
  }
}
```

The key is the npm package name. Install the package so it's resolvable:

```bash
pnpm add kizuna-plugin-example
```

For local development, use a relative path or `pnpm link`.

## Error Handling

Plugins are isolated. If a hook throws:

1. The error is logged via `ctx.logger.error()`
2. The pipeline continues with the unmodified input
3. Other plugins still execute
4. The user's workflow is never blocked

You don't need defensive try/catch in every hook — the core handles it.

## Performance Constraints

| Hook                             | Budget per plugin |
| -------------------------------- | ----------------- |
| `beforeCapture` / `afterCapture` | < 50ms            |
| `beforeSearch` / `afterSearch`   | < 30ms            |
| `enrichContext`                  | < 50ms            |
| `init` / `shutdown`              | < 1s              |

Plugins doing expensive operations (network calls, LLM inference) should clearly document the latency impact.

## Naming Conventions

- Official plugins: `@kizuna/plugin-xxx`
- Third-party plugins: `kizuna-plugin-xxx` (recommended) or any npm package name

## Examples

See the built-in plugins for reference:

| Plugin                      | Pattern          | Hooks Used                                                                      |
| --------------------------- | ---------------- | ------------------------------------------------------------------------------- |
| `plugin-pii-sanitizer`      | Direct export    | `beforeCapture`                                                                 |
| `plugin-multi-repo-sharing` | Factory function | `beforeSearch`, `afterSearch`, `migrations`                                     |
| `plugin-openapi-awareness`  | Factory function | `enrichContext`, `tokenBudget`                                                  |
| `plugin-hybrid-search`      | Factory function | `init`, `shutdown`, `afterCapture`, `beforeSearch`, `afterSearch`, `migrations` |
| `plugin-telepathy`          | Factory function | `mcpTools`, `migrations`                                                        |
