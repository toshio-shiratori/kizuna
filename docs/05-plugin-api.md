# Plugin API Specification

This document defines the plugin API for Kizuna. Plugins extend Kizuna's behavior at well-defined hook points without modifying the core.

## Plugin Discovery

Plugins are discovered in two ways:

1. **Configuration-declared**: Listed in the project's `.kizuna/config.json` under the `plugins` array
2. **Auto-discovered**: Installed npm packages whose names match `@kizuna/plugin-*` or are in a configured plugin search path

Configuration-declared plugins take precedence over auto-discovered ones.

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

Every plugin exports a default object conforming to the `Plugin` interface:

```typescript
import type { Plugin } from "@kizuna/core";

export default {
  name: "@your-scope/plugin-name",
  version: "1.0.0",

  // ... lifecycle, hooks, tools, etc.
} satisfies Plugin;
```

### The `Plugin` Interface

```typescript
export interface Plugin {
  /** Plugin identifier, typically the npm package name */
  readonly name: string;

  /** Plugin version, used for migration tracking */
  readonly version: string;

  /** Optional description shown in CLI listings */
  readonly description?: string;

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
  /** SQLite database handle (for direct queries) */
  readonly db: Database;

  /** The plugin's configuration from .kizuna/config.json */
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
  inputSchema: JSONSchema;
  handler(args: unknown, ctx: PluginContext): Promise<MCPToolResult>;
}
```

### `CLICommandDefinition`

```typescript
export interface CLICommandDefinition {
  name: string;
  description: string;
  options?: CLIOption[];
  handler(args: ParsedArgs, ctx: PluginContext): Promise<void>;
}
```

## Hook Execution Order

When multiple plugins implement the same hook, they execute in the order plugins are listed in the project configuration.

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

## Example Plugin: pii-sanitizer

A minimal plugin that redacts API keys before storage:

```typescript
import type { Plugin } from "@kizuna/core";

const PATTERNS = [
  { name: "anthropic_key", regex: /sk-ant-[A-Za-z0-9_-]{20,}/g },
  { name: "openai_key", regex: /sk-[A-Za-z0-9]{32,}/g },
  { name: "github_token", regex: /ghp_[A-Za-z0-9]{36}/g },
];

export default {
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
} satisfies Plugin;
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

## Plugin Configuration Example

A project enabling both plugins:

```jsonc
// .kizuna/config.json
{
  "project": {
    "id": "my-frontend-app",
  },
  "plugins": [
    {
      "name": "@kizuna/plugin-pii-sanitizer",
      "enabled": true,
      "options": {},
    },
    {
      "name": "@kizuna/plugin-multi-repo-sharing",
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
  ],
}
```

## Compatibility and Versioning

The plugin API follows semantic versioning:

- **Patch versions**: Bug fixes, no breaking changes
- **Minor versions**: New optional methods or types, backward-compatible
- **Major versions**: Breaking changes to existing methods or types

Plugins declare their compatible core version via `peerDependencies`. The CLI warns if installed plugins are incompatible with the active core version.

## Testing Plugins

The `@kizuna/core` package exports test utilities:

```typescript
import { createTestContext, runPluginHook } from "@kizuna/core/testing";

const ctx = createTestContext({ projectId: "test", options: {} });
const result = await runPluginHook(myPlugin, "beforeCapture", testChunk, ctx);

expect(result.metadata["my-plugin"]).toBeDefined();
```

Plugins should include unit tests using these utilities and integration tests against a real SQLite database.

## What Plugins Cannot Do

Plugins are sandboxed in the sense that they:

- **Cannot modify other plugins' state** (each plugin has its own KV namespace)
- **Cannot modify core schema directly** (must go through migrations)
- **Cannot bypass the configured pipeline** (all chunks go through all enabled plugins)
- **Cannot intercept core CLI commands** (only add new ones)

This sandboxing is enforced by convention rather than runtime sandboxing — Kizuna trusts plugin authors to follow these rules.
