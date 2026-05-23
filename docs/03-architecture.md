# Architecture

This document describes Kizuna's architectural design at a high level. Detailed specifications for storage and plugins are in separate documents.

## High-Level Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    Claude Code Agents                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ Repository A │  │ Repository B │  │ Repository C │          │
│  │ (e.g. FE)    │  │ (e.g. BE)    │  │ (e.g. infra) │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
└─────────┼─────────────────┼─────────────────┼──────────────────┘
          │                 │                 │
          │  Hooks          │  Hooks          │  Hooks
          │  + MCP          │  + MCP          │  + MCP
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                       Kizuna Layer                               │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Hook Handlers (CLI)                         │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │   │
│  │  │ SessionEnd   │  │ UserPrompt   │  │ SessionStart │  │   │
│  │  │ → Capture    │  │ Submit       │  │ → Inject base│  │   │
│  │  │              │  │ → Inject Top │  │   context    │  │   │
│  │  │              │  │   K          │  │              │  │   │
│  │  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  │   │
│  └─────────┼─────────────────┼─────────────────┼──────────┘   │
│            │                 │                 │               │
│  ┌─────────▼─────────────────▼─────────────────▼──────────┐   │
│  │                  Plugin Manager                          │   │
│  │  Registers, lifecycle, hook points                       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│  ┌─────────────────────────▼───────────────────────────────┐   │
│  │              Pipelines (kizuna-core)                     │   │
│  │  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐       │   │
│  │  │ Capture │ │ Search  │ │ Inject  │ │Maintain │       │   │
│  │  └─────────┘ └─────────┘ └─────────┘ └─────────┘       │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                    │
│  ┌─────────────────────────▼───────────────────────────────┐   │
│  │                   Storage Layer                          │   │
│  │           SQLite + FTS5 (trigram tokenizer)              │   │
│  │           Single file per project (federated read-only)  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            ▲                                    │
│  ┌─────────────────────────┴───────────────────────────────┐   │
│  │                      MCP Server                          │   │
│  │  Provides bidirectional search/recall for active agents  │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Package Structure

Kizuna is a TypeScript monorepo managed by pnpm workspaces.

```
kizuna/
├── packages/
│   ├── kizuna-core/           Generic memory engine
│   │   ├── storage/           SQLite + FTS5
│   │   ├── pipelines/         Capture, Search, Inject, Maintain
│   │   ├── plugin/            PluginManager, types
│   │   └── config/            Configuration loading
│   │
│   ├── kizuna-mcp/            MCP Server (stdio transport)
│   │   └── tools/             search, save, list, delete, etc.
│   │
│   ├── kizuna-cli/            Command-line interface
│   │   └── commands/          setup, search, list, prune, web, etc.
│   │
│   ├── kizuna-web/            Web UI (Hono + Vite + React)
│   │   ├── server/            Hono HTTP server + API routes
│   │   └── client/            React 19 + Tailwind CSS v4 frontend
│   │
│   └── plugin-*               Optional plugins (separate packages)
│       ├── plugin-pii-sanitizer/
│       ├── plugin-multi-repo-sharing/
│       └── plugin-openapi-contract/  (project-specific, separate repo)
│
├── docs/                      This directory
└── (config files)
```

### Package Dependency Rules

- `kizuna-core` depends ONLY on `better-sqlite3`
- `kizuna-mcp` depends on `kizuna-core` and the official MCP SDK
- `kizuna-cli` depends on `kizuna-core` and a CLI framework (commander or similar)
- Plugins depend on `kizuna-core` (for plugin API types) and their own specific dependencies

This dependency direction is enforced. The core must never depend on MCP, CLI, or plugins.

## Data Flow

### Save Path (Capture)

```
1. Claude Code session ends
        ↓
2. SessionEnd hook fires
        ↓
3. CLI reads transcript JSONL
        ↓
4. Plugin Manager: beforeCapture hooks run on each chunk
        ↓
5. Capture pipeline: rule-based chunking
        ↓
6. Plugin Manager: afterCapture hooks run on each stored chunk
        ↓
7. Storage: insert into SQLite (chunks + FTS5)
        ↓
8. Maintenance check: if 24h since last run, perform cleanup
```

### Recall Path (Inject)

```
1. User submits a prompt to Claude Code
        ↓
2. UserPromptSubmit hook fires with the prompt text
        ↓
3. Plugin Manager: beforeSearch hooks transform the query
        ↓
4. Search pipeline: FTS5 search + BM25 + time decay
        ↓
5. Plugin Manager: afterSearch hooks rerank/filter results
        ↓
6. Inject pipeline: format top-K results
        ↓
7. Plugin Manager: enrichContext hooks add additional context blocks
        ↓
8. Hook outputs the augmented prompt to Claude Code
```

### MCP Path (Active Search)

When an agent explicitly searches (rather than relying on auto-injection):

```
1. Agent invokes MCP tool (e.g., kizuna_search)
        ↓
2. MCP Server receives the request
        ↓
3. Same Search pipeline as Recall Path, steps 3-5
        ↓
4. MCP Server returns formatted results to agent
```

## Configuration

Kizuna supports two levels of configuration:

### Global Configuration

Location: `~/.config/kizuna/config.json` (Linux/macOS) or `%APPDATA%/kizuna/config.json` (Windows)

Defines defaults that apply across all projects:

- Storage path
- Default search parameters (top K, time decay)
- Plugin search paths
- Maintenance thresholds

### Project Configuration

Location: `.kizuna/config.json` in the project root

Overrides global configuration for a specific project. Defines:

- Project ID
- Shared namespace (for cross-repo sharing)
- Active plugins
- Plugin-specific options

Project configuration takes precedence over global configuration.

## Hooks Integration

Kizuna registers as Claude Code hooks via the `claude` CLI's settings. The setup command (`kizuna setup`) handles this automatically.

Hook registration is per-project by default but can be made global. Three hooks are registered:

| Hook             | Purpose                                                        | Latency budget    |
| ---------------- | -------------------------------------------------------------- | ----------------- |
| SessionStart     | Inject baseline context (recent decisions, important memories) | < 200ms           |
| UserPromptSubmit | Inject memories relevant to the current prompt                 | < 100ms           |
| SessionEnd       | Capture transcript and run maintenance                         | < 5s (background) |

## Storage Strategy

### Default: Per-Project Storage

By default, each project has its own SQLite file at `.kizuna/memory.db`. This isolates memories by project.

### Federated Search for Multi-Repo Collaboration

When the `multi-repo-sharing` plugin is enabled, a project can search other projects' memories via federated read-only queries. Each project keeps its own `.kizuna/memory.db` as the sole writable database — there is no shared file.

The plugin configuration declares a list of **references** pointing to other projects' databases. At search time, the plugin opens each referenced database in read-only mode, executes the same FTS5 query, normalizes scores across databases, and merges results with local search results. Writes always target the local database only.

References are directional: frontend can reference backend without backend referencing frontend. This naturally supports asymmetric collaboration patterns.

This design choice (federated search vs. shared database) is documented in ADR-0013.

## Plugin Architecture (Summary)

The plugin system exposes hook points at each pipeline stage:

- `beforeCapture(chunk)` / `afterCapture(chunk)`
- `beforeSearch(query)` / `afterSearch(results)`
- `enrichContext(injection)`

Plugins can also:

- Add custom MCP tools
- Add custom CLI commands
- Define schema migrations for plugin-specific tables
- Read and write to a per-plugin key-value store

Detailed plugin API is documented in `05-plugin-api.md`.

## Concurrency and Multi-Process Safety

SQLite is configured in WAL mode with `busy_timeout` set, which allows safe concurrent access from multiple processes (multiple Claude Code sessions running simultaneously).

The hook handlers are short-lived processes that open the database, do their work, and close. There is no long-running daemon.

The MCP server, when running, holds the database open but uses the same WAL/busy_timeout strategy and can run alongside hooks safely.

## Error Handling Philosophy

Hooks should fail silently or log warnings, never block the user's workflow. Specifically:

- If save fails: log error, do not retry, do not interrupt
- If search fails: return empty results, log warning
- If injection fails: pass the original prompt through unmodified

This is intentional. A memory tool that interrupts the user's flow is worse than one that occasionally misses captures.

The CLI commands (`kizuna search`, etc.) MAY surface errors to the user, since the user is actively waiting for a response.

## What's Out of Scope (For Now)

The following are explicitly NOT part of the initial architecture. They may be added later as plugins or future features, but should not influence current design decisions:

- **Vector search in core**: Vector search is a future hybrid plugin, not part of the core
- **LLM-based summarization in core**: Plugins may add this; the core uses rule-based chunking only
- **Cloud sync**: Out of scope; users are expected to use shared filesystems if they want sharing
- **Encryption at rest**: SQLite encryption is the user's responsibility (filesystem-level encryption recommended)
- **Multi-user authentication**: Kizuna assumes single-user-per-machine; multi-user scenarios would require significant additional design

## Future Considerations

- **MCP transport options beyond stdio**: HTTP/SSE for remote scenarios
- **Hybrid search plugin**: Optional FTS5 + sqlite-vec with a small embedding model
- **Cross-language plugin support**: Currently TypeScript only; future plugins might be in Python or Rust via a wrapper protocol
- **Remote multi-repo sync**: For when referenced databases are not on the local filesystem
