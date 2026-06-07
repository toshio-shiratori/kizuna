# Plugin API Specification

This document defines the plugin API for Kizuna. Plugins extend Kizuna's behavior at well-defined hook points without modifying the core.

> For a step-by-step guide to building and publishing a plugin (including
> third-party plugins), see [08-plugin-development.md](./08-plugin-development.md).
> This document is the reference specification for the types and contracts.

## Plugin Discovery

Plugins are discovered **only** through explicit declaration in the project's
`.kizuna/plugins.json` file. There is no convention-based auto-discovery or npm
registry scanning — a plugin loads when, and only when, it is listed here with
`enabled: true`. See [ADR-0017](./adr/0017-explicit-config-plugin-discovery.md)
for the rationale.

```jsonc
// .kizuna/plugins.json
{
  "plugins": {
    "@kizuna/plugin-pii-sanitizer": { "enabled": true, "options": {} },
  },
}
```

Each key is the npm package name; the value declares whether the plugin is
enabled and supplies its `options`. The loader imports each enabled package
(resolving it from the CLI's `node_modules` first, then the project's), so the
package must be installed. Manage these entries with the `kizuna plugin`
commands (`enable`, `disable`, `config`) rather than editing the file by hand
(see [ADR-0014](./adr/0014-cli-plugin-config-command.md)).

## Plugin Package Structure

A plugin is an npm package with this structure:

```
@your-scope/plugin-name/
├── package.json           # Standard npm package
├── src/
│   ├── index.ts           # Main export (the plugin object)
│   └── ...
└── README.md
```

The `package.json` should declare `kizuna-core` as a peer dependency:

```json
{
  "name": "@your-scope/plugin-name",
  "version": "1.0.0",
  "peerDependencies": {
    "@kizuna/core": "^0.x.0"
  }
}
```

## Plugin Interface

Every plugin provides a **named export** conforming to the `Plugin` interface
(Kizuna uses named exports only — no default exports). The loader resolves, in
order: (1) any named export matching `createXxxPlugin` (a factory called with
the plugin's `options`), then (2) any named export that is a `Plugin` object.

```typescript
import type { Plugin } from "@kizuna/core";

export const myPlugin: Plugin = {
  name: "@your-scope/plugin-name",
  version: "1.0.0",

  // ... lifecycle, hooks, tools, etc.
};
```

For plugins that need initialization or closure state, export a
`createXxxPlugin` factory instead — see [08-plugin-development.md](./08-plugin-development.md)
for both styles.

### The `Plugin` Interface

```typescript
export interface Plugin {
  /** Plugin identifier, typically the npm package name */
  readonly name: string;

  /** Plugin version, used for migration tracking */
  readonly version: string;

  /** Optional description shown in CLI listings */
  readonly description?: string;

  /**
   * Token budget this plugin needs for enrichContext output.
   * The inject pipeline reserves this many tokens from the total budget
   * so that the plugin's context block is not crowded out by memory chunks.
   * Only relevant for plugins that implement enrichContext.
   */
  readonly tokenBudget?: number;

  // ─── Lifecycle ──────────────────────────────────────

  /** Called once when the plugin is loaded */
  init?(ctx: PluginContext): Promise<void> | void;

  /** Called once when the plugin is unloaded */
  shutdown?(ctx: PluginContext): Promise<void> | void;

  // ─── Capture Pipeline Hooks ─────────────────────────

  /** Modify or filter chunks before they are stored */
  beforeCapture?(chunk: RawChunk, ctx: PluginContext): Promise<RawChunk | null> | RawChunk | null;

  /** React to chunks after they have been stored */
  afterCapture?(chunk: StoredChunk, ctx: PluginContext): Promise<void> | void;

  // ─── Search Pipeline Hooks ──────────────────────────

  /** Modify the search query before execution */
  beforeSearch?(query: SearchQuery, ctx: PluginContext): Promise<SearchQuery> | SearchQuery;

  /** Modify or filter search results */
  afterSearch?(
    results: SearchResult[],
    ctx: PluginContext,
  ): Promise<SearchResult[]> | SearchResult[];

  // ─── Inject Pipeline Hooks ──────────────────────────

  /** Add additional context to be injected into the prompt */
  enrichContext?(
    injection: ContextInjection,
    ctx: PluginContext,
  ): Promise<ContextInjection> | ContextInjection;

  // ─── Extensions ─────────────────────────────────────

  /** Schema migrations for plugin-specific tables */
  migrations?(): Migration[];

  /** Custom MCP tools provided by this plugin */
  mcpTools?(): MCPToolDefinition[];

  /** Custom CLI commands provided by this plugin */
  cliCommands?(): CLICommandDefinition[];
}
```

## Core Types

### `PluginContext`

Passed to every plugin method. Provides access to scoped resources.

```typescript
export interface PluginContext {
  /**
   * SQLite database handle (for direct queries).
   * The runtime value is a better-sqlite3 Database instance, but the type
   * is declared as `unknown` to avoid forcing better-sqlite3 into plugin
   * type dependencies. Plugins that need direct DB access should cast:
   *   const rawDb = ctx.db as BetterSqlite3.Database;
   */
  readonly db: unknown;

  /** The plugin's configuration (the entry from .kizuna/plugins.json) */
  readonly config: PluginConfig;

  /** The active project's configuration */
  readonly projectConfig: ProjectConfig;

  /** Logger scoped to this plugin */
  readonly logger: Logger;

  /** Per-plugin key-value store */
  readonly storage: PluginStorage;
}

export interface PluginStorage {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export interface PluginConfig {
  readonly enabled: boolean;
  readonly options: Record<string, unknown>;
}

export interface ProjectConfig {
  readonly id: string;
  readonly displayName?: string;
  readonly sharedNamespace?: string;
  readonly dir?: string;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}
```

### `RawChunk` and `StoredChunk`

```typescript
export interface RawChunk {
  sessionId: string;
  turnIndex: number;
  role: "user" | "assistant";
  content: string;
  metadata: Record<string, unknown>;
}

export interface StoredChunk extends RawChunk {
  id: number;
  tokenCount: number;
  importance: number;
  createdAt: string;
}
```

### `SearchQuery` and `SearchResult`

```typescript
export interface SearchQuery {
  /** The text to search for */
  text: string;

  /** Maximum number of results */
  limit: number;

  /** Optional filters */
  filters?: SearchFilters;

  /** Plugin-specific extensions */
  extensions?: Record<string, unknown>;
}

export interface SearchFilters {
  sessionIds?: string[];
  projectIds?: string[];
  namespaces?: string[];
  minImportance?: number;
  createdAfter?: string;
  createdBefore?: string;
}

export interface SearchResult {
  chunk: StoredChunk;

  /** Combined relevance score (higher = more relevant) */
  score: number;

  /** Optional plugin-specific annotations */
  annotations?: Record<string, unknown>;
}
```

### `ContextInjection`

```typescript
export interface ContextInjection {
  /** The user's original prompt */
  readonly userPrompt: string;

  /** Search results to be injected */
  chunks: SearchResult[];

  /** Additional context blocks added by plugins */
  contextBlocks: ContextBlock[];
}

export interface ContextBlock {
  /** Identifier for the source of this block */
  source: string;

  /** Display priority (higher = shown first) */
  priority: number;

  /** Markdown-formatted content */
  content: string;
}
```

### `Migration`

```typescript
export interface Migration {
  /** Version number (must be unique within the plugin) */
  version: number;

  /** Human-readable description */
  description: string;

  /** SQL to apply this migration */
  up: string;

  /** Optional SQL to roll back (best-effort) */
  down?: string;
}
```

### `MCPToolDefinition`

```typescript
export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler(args: unknown, ctx: PluginContext): Promise<MCPToolResult>;
}

export interface MCPToolResult {
  content: unknown;
  isError?: boolean;
}
```

### `CLICommandDefinition`

```typescript
export interface CLICommandDefinition {
  name: string;
  description: string;
  options?: CLIOption[];
  handler(args: Record<string, unknown>, ctx: PluginContext): Promise<void>;
}

export interface CLIOption {
  name: string;
  description: string;
  required?: boolean;
  defaultValue?: unknown;
}
```

## Hook Execution Order

When multiple plugins implement the same hook, they execute in the order their entries appear in `.kizuna/plugins.json`.

### Capture Pipeline

```
For each chunk:
  for plugin in plugins:
    chunk = await plugin.beforeCapture(chunk, ctx)
    if chunk is null: skip this chunk

  storedChunk = await storage.insert(chunk)

  for plugin in plugins:
    await plugin.afterCapture(storedChunk, ctx)
```

### Search Pipeline

```
for plugin in plugins:
  query = await plugin.beforeSearch(query, ctx)

results = await searchEngine.execute(query)

for plugin in plugins:
  results = await plugin.afterSearch(results, ctx)
```

### Inject Pipeline

```
injection = { userPrompt, chunks: searchResults, contextBlocks: [] }

for plugin in plugins:
  injection = await plugin.enrichContext(injection, ctx)

formatted = formatForInjection(injection)
```

## Error Handling

If a plugin throws an error in any hook:

1. The error is logged via `ctx.logger.error()`
2. The pipeline continues with the input unchanged from before the failing plugin
3. Subsequent plugins still execute
4. The user's workflow is never blocked

Plugins SHOULD handle their own errors gracefully and only throw for truly unrecoverable conditions.

## Performance Constraints

Plugins must respect the latency budgets of their hook points:

| Hook                         | Budget per plugin |
| ---------------------------- | ----------------- |
| beforeCapture / afterCapture | < 50ms            |
| beforeSearch / afterSearch   | < 30ms            |
| enrichContext                | < 50ms            |
| init / shutdown              | < 1s              |

Slow plugins degrade the user experience. Plugins doing expensive operations (e.g., LLM calls) should be opt-in and clearly documented.

## Token Budget Reservation

Plugins that implement `enrichContext` can declare a `tokenBudget` field to reserve space in the prompt for their output. Without this, memory chunks may fill the entire token budget before the plugin's context block is added.

### How It Works

1. The inject pipeline reads the total token budget from the configuration (default: 2000 tokens).
2. The `PluginManager` sums all active plugins' `tokenBudget` values via `getTotalReservedTokens()`.
3. If the total reserved tokens fit within the budget, that amount is subtracted from the chunk budget. Memory chunks fill the remaining space.
4. If the total reserved tokens meet or exceed the budget, `scaleTokenBudgets()` caps the reserved portion at 80% of the total and logs a warning.
5. After chunk formatting, the remaining token space is available for `enrichContext` output from all plugins (both those with and without a declared `tokenBudget`).

### When to Use

Declare `tokenBudget` when your plugin adds non-trivial context via `enrichContext` and you need to guarantee space. For example, `plugin-openapi-awareness` declares `tokenBudget: 600` to ensure matched API endpoint information is always included.

Plugins that do not implement `enrichContext` (e.g., `plugin-pii-sanitizer`) should not declare `tokenBudget`.

## Example Plugin: pii-sanitizer

A minimal plugin that redacts API keys before storage:

```typescript
import type { Plugin } from "@kizuna/core";

const PATTERNS = [
  { name: "anthropic_key", regex: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: "openai_key", regex: /sk-[A-Za-z0-9]{32,}/g },
  { name: "github_token", regex: /ghp_[A-Za-z0-9]{36}/g },
];

export const piiSanitizer: Plugin = {
  name: "@kizuna/plugin-pii-sanitizer",
  version: "1.0.0",
  description: "Redacts API keys and tokens before storage",

  beforeCapture(chunk, ctx) {
    let content = chunk.content;
    const redactedTypes: string[] = [];
    let redactedCount = 0;

    for (const pattern of PATTERNS) {
      const matches = content.match(pattern.regex);
      if (matches) {
        content = content.replace(pattern.regex, `[REDACTED:${pattern.name}]`);
        redactedTypes.push(pattern.name);
        redactedCount += matches.length;
      }
    }

    if (redactedCount > 0) {
      ctx.logger.info("Redacted PII", { redactedCount, redactedTypes });
      return {
        ...chunk,
        content,
        metadata: {
          ...chunk.metadata,
          [this.name]: { redactedCount, redactedTypes },
        },
      };
    }

    return chunk;
  },
};
```

## Example Plugin: multi-repo-sharing

A plugin that enables cross-repository memory search via federated queries.
Each project keeps its own database while referencing other projects'
databases as read-only search targets. Uses a factory function to maintain
closure-scoped state for passing query context between hooks.

```typescript
import type { Plugin } from "@kizuna/core";

interface RepoReference {
  name: string;
  dbPath: string;
}

interface Options {
  references?: RepoReference[];
  halfLifeDays?: number;
}

export function createMultiRepoSharing(): Plugin {
  // Closure-scoped state to pass query from beforeSearch to afterSearch
  let lastQueryText: string | null = null;
  let lastQueryLimit: number = 10;

  return {
    name: "@kizuna/plugin-multi-repo-sharing",
    version: "0.1.0",
    description: "Enables cross-repository memory search via federated queries",

    beforeSearch(query) {
      // Capture query text for federated fan-out in afterSearch
      lastQueryText = query.text;
      lastQueryLimit = query.limit;
      return query;
    },

    afterSearch(results, ctx) {
      const queryText = lastQueryText;
      const queryLimit = lastQueryLimit;
      lastQueryText = null;

      const options = ctx.config.options as Options;
      const references = options.references;
      if (!references || references.length === 0) return results;

      // Annotate local results with source
      const annotatedLocal = results.map((r) => ({
        ...r,
        annotations: { ...r.annotations, source: "local" },
      }));

      if (!queryText) return annotatedLocal;

      // Query each referenced database (read-only), normalize scores,
      // merge with local results, and return top results by score
      const remoteResults = queryReferences(
        references,
        queryText,
        queryLimit,
        options.halfLifeDays ?? 30,
        ctx.logger,
      );

      const merged = [...normalizeScores(annotatedLocal), ...remoteResults];
      merged.sort((a, b) => b.score - a.score);
      return merged.slice(0, queryLimit);
    },
  };
}
```

## Plugin: telepathy

Enables real-time context sharing between active Claude Code sessions across repositories. Each project stores at most one telepathy message. Referenced databases are opened in read-only mode, consistent with the federated search pattern (ADR-0013).

- **Hooks used**: None (MCP tools only)
- **MCP tools**: `kizuna_telepathy_send` (write to local DB), `kizuna_telepathy_receive` (read from referenced DBs)
- **Migrations**: Creates `telepathy_messages` table
- **Factory**: `createTelepathy()` returns a `Plugin` instance
- **ADR**: [0016-telepathy-plugin-for-active-session-sharing](adr/0016-telepathy-plugin-for-active-session-sharing.md)

## Plugin: openapi-awareness

Injects relevant OpenAPI endpoint information into prompts based on the user's query. Parses OpenAPI specs at init time, matches endpoints by keyword similarity (with synonym expansion), and formats matched endpoints as a context block via `enrichContext`.

- **Hooks used**: `enrichContext`
- **`tokenBudget`**: `600` (reserves 600 tokens for endpoint context)
- **Configuration**: `specPath` or `specPaths` (paths to OpenAPI spec files), `maxResults`, `synonyms`, `disableBuiltinSynonyms`
- **Factory**: `createOpenAPIAwareness()` returns a `Plugin` instance

## Plugin: hybrid-search

Combines FTS5 lexical search with vector similarity for improved recall. Uses `@huggingface/transformers` to generate embeddings at capture time, stores them in a plugin-managed table, and reranks search results by blending BM25 and cosine similarity scores.

- **Hooks used**: `afterCapture` (save embeddings), `beforeSearch` / `afterSearch` (reranking)
- **Migrations**: Creates `hybrid_search_embeddings` table
- **Configuration**: `alpha` (blend weight, default 0.5), `dimensions`, `model`, `embeddingProvider` (injectable for testing)
- **Factory**: `createHybridSearchPlugin(options?)` returns a `Plugin` instance

## Plugin Configuration Example

A project enabling multiple plugins. Plugins are keyed by npm package name;
entry order determines hook execution order.

```jsonc
// .kizuna/plugins.json
{
  "plugins": {
    "@kizuna/plugin-pii-sanitizer": {
      "enabled": true,
      "options": {},
    },
    "@kizuna/plugin-multi-repo-sharing": {
      "enabled": true,
      "options": {
        "references": [
          {
            "name": "backend-api",
            "dbPath": "/path/to/backend-api/.kizuna/memory.db",
          },
        ],
        "halfLifeDays": 14,
      },
    },
    "@kizuna/plugin-telepathy": {
      "enabled": true,
      "options": {
        "references": [
          {
            "name": "backend-api",
            "dbPath": "/path/to/backend-api/.kizuna/memory.db",
          },
        ],
      },
    },
    "@kizuna/plugin-openapi-awareness": {
      "enabled": true,
      "options": {
        "specPaths": ["./openapi.yaml"],
      },
    },
  },
}
```

## Compatibility and Versioning

The plugin API follows semantic versioning:

- **Patch versions**: Bug fixes, no breaking changes
- **Minor versions**: New optional methods or types, backward-compatible
- **Major versions**: Breaking changes to existing methods or types

Plugins declare their compatible core version via `peerDependencies`. The CLI warns if installed plugins are incompatible with the active core version.

## Testing Plugins

`@kizuna/core` exports the plugin types but no test harness. Plugins test their
hooks directly by constructing a minimal `PluginContext` (a plain object
implementing `db`, `config`, `projectConfig`, `logger`, and `storage`) and
invoking the hook:

```typescript
import { describe, it, expect } from "vitest";
import type { PluginContext, Logger, PluginStorage } from "@kizuna/core";
import { myPlugin } from "./index.js";

function makeContext(options: Record<string, unknown> = {}): PluginContext {
  const logger: Logger = { debug() {}, info() {}, warn() {}, error() {} };
  const storage: PluginStorage = {
    async get() {
      return null;
    },
    async set() {},
    async delete() {},
    async list() {
      return [];
    },
  };
  return {
    db: {},
    config: { enabled: true, options },
    projectConfig: { id: "test-project" },
    logger,
    storage,
  };
}

it("passes chunks through beforeCapture", async () => {
  const ctx = makeContext();
  const result = await myPlugin.beforeCapture!(testChunk, ctx);
  expect(result).not.toBeNull();
});
```

See `plugin-pii-sanitizer/src/index.test.ts` for a complete example, and
[08-plugin-development.md](./08-plugin-development.md) (Step 6) for the full
walkthrough. Plugins should include unit tests over their hooks and, for plugins
that touch the database (migrations, KV storage), integration tests against a
real SQLite file.

## What Plugins Cannot Do

Plugins are sandboxed in the sense that they:

- **Cannot modify other plugins' state** (each plugin has its own KV namespace)
- **Cannot modify core schema directly** (must go through migrations)
- **Cannot bypass the configured pipeline** (all chunks go through all enabled plugins)
- **Cannot intercept core CLI commands** (only add new ones)

This sandboxing is enforced by convention rather than runtime sandboxing — Kizuna trusts plugin authors to follow these rules.
