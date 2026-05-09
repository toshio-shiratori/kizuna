# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.0] - 2026-05-09

Initial release with core memory system, plugin support, and MCP server.

### Added

- **Core memory engine** (`@kizuna/core`)
  - SQLite storage with FTS5 full-text search and WAL mode
  - CJK n-gram preprocessing for Japanese text search
  - Capture pipeline: transcript JSONL parsing and rule-based chunking
  - Search pipeline: BM25 ranking with time decay
  - Inject pipeline: context formatting with token budget control
  - Maintenance pipeline: automatic cleanup with 24-hour throttle
  - Plugin system: PluginManager with lifecycle, KV storage, and migrations
  - Plugin hooks in all pipelines (beforeCapture, afterCapture, beforeSearch, afterSearch, enrichContext)

- **CLI** (`@kizuna/cli`)
  - `kizuna setup` -- configure Claude Code hooks for a project
  - `kizuna search` -- search stored memories
  - `kizuna list` -- list chunks by session
  - `kizuna stats` -- database statistics
  - `kizuna prune` -- manual memory cleanup
  - Hook handlers for SessionEnd, UserPromptSubmit, and SessionStart

- **MCP server** (`@kizuna/mcp`)
  - stdio transport using the official MCP SDK
  - Tools: `kizuna_search`, `kizuna_save`, `kizuna_list`, `kizuna_delete`

- **Plugins**
  - `@kizuna/plugin-pii-sanitizer` -- redacts API keys, tokens, and secrets before storage
  - `@kizuna/plugin-multi-repo-sharing` -- cross-repository memory sharing via namespaces

- **Developer tooling**
  - ESLint + Prettier configuration
  - GitHub Actions CI (Node.js v22/v24 matrix)
  - 233 tests across all packages
