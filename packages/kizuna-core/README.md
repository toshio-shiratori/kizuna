# @kizuna/core

Core memory engine for Kizuna. Provides storage, search, capture/inject pipelines, maintenance, and the plugin system.

Depends only on `better-sqlite3`. See the [root README](../../README.md) for full project context.

## Installation

```bash
pnpm add @kizuna/core
```

Requires Node.js >= 24.0.0.

## Key Exports

### Storage

- `Database` -- SQLite wrapper with WAL mode. Manages sessions, chunks, and FTS5 indexes.

### Pipelines

- `captureTranscript(db, options)` -- Parses a Claude Code transcript JSONL, chunks it, and stores to SQLite.
- `parseTranscriptFile(path)` / `parseTranscriptContent(content)` -- Parse transcript JSONL into `ParsedTurn[]`.
- `chunkifyTurns(turns)` -- Converts parsed turns into `RawChunk[]`.
- `searchMemory(db, query, options?)` -- FTS5 search with BM25 + time decay ranking.
- `injectMemory(db, prompt, options?)` -- Searches and formats relevant memories for context injection.
- `formatContext(results, options?)` -- Formats search results as Markdown with token budget control.
- `estimateTokens(text)` -- Rough token count estimation.
- `preprocessQuery(text)` -- Prepares query text with CJK n-gram tokenization.

### Maintenance

- `runMaintenance(db, options?)` -- Removes old chunks, empty sessions, reclaims disk space. Throttled to once per 24h.

### Plugin System

- `PluginManager` -- Discovers, loads, and manages plugin lifecycle.
- `SqlitePluginStorage` -- Per-plugin key-value storage backed by the `plugin_kv` table.
- `runPluginMigrations(db, plugin)` -- Runs a plugin's schema migrations.

### Types

- `Plugin` -- Interface for implementing plugins (lifecycle, pipeline hooks, MCP tools, CLI commands).
- `Session`, `RawChunk`, `StoredChunk` -- Storage types.
- `SearchQuery`, `SearchFilters`, `SearchResult` -- Search types.
- `ContextInjection`, `ContextBlock` -- Inject pipeline types.
- `ProjectConfig`, `PluginConfig`, `PluginContext`, `PluginStorage` -- Plugin types.
- `MaintenanceResult`, `MaintenanceOptions` -- Maintenance types.
- `Migration`, `MCPToolDefinition`, `CLICommandDefinition` -- Plugin extension types.

## Development

```bash
pnpm build    # Compile TypeScript
pnpm test     # Run vitest
```
