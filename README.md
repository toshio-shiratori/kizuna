# Kizuna 絆

[![CI](https://github.com/toshio-shiratori/kizuna/actions/workflows/ci.yml/badge.svg)](https://github.com/toshio-shiratori/kizuna/actions/workflows/ci.yml)

> A bond between AI agents.

A plugin-based local long-term memory system for [Claude Code](https://docs.anthropic.com/en/docs/claude-code), designed for cross-repository agent collaboration.

## What is Kizuna?

When you use Claude Code across multiple repositories, each agent operates in isolation. Kizuna creates a shared, persistent memory layer so agents can learn from each other's sessions.

- **Auto save** -- Session transcripts are captured automatically via hooks (zero manual effort)
- **Always recall** -- Relevant memories are injected into every prompt automatically
- **Cross-repo sharing** -- Agents in different repositories can share context via namespaces
- **Zero token cost on save** -- Rule-based chunking, no LLM calls for storage
- **Local-first** -- All data stays in a local SQLite file, no external APIs

## Quick Start

### Prerequisites

- Node.js >= 22.0.0
- pnpm >= 11.0.0
- [Claude Code](https://docs.anthropic.com/en/docs/claude-code)

### Install

```bash
git clone https://github.com/toshio-shiratori/kizuna.git
cd kizuna
pnpm install
pnpm build
```

### Setup for a Project

Run `kizuna setup` in any project directory to register Claude Code hooks:

```bash
cd /path/to/your/project
npx kizuna setup
# or if kizuna is in PATH:
kizuna setup
```

This creates `.kizuna/memory.db` and registers three hooks in `.claude/settings.json`:

| Hook               | What it does                                |
| ------------------ | ------------------------------------------- |
| `SessionEnd`       | Captures the session transcript into memory |
| `UserPromptSubmit` | Injects relevant memories into each prompt  |
| `SessionStart`     | Injects baseline context at session start   |

That's it. Memories are captured and recalled automatically from now on.

### Configuration

Kizuna can be configured at two levels:

| File                            | Scope                          |
| ------------------------------- | ------------------------------ |
| `~/.config/kizuna/config.json`  | Global defaults (all projects) |
| `<project>/.kizuna/config.json` | Per-project overrides          |

Settings are merged in order: **built-in defaults < global config < project config**.

```jsonc
// Example: ~/.config/kizuna/config.json
{
  "pipeline": {
    "tokenBudget": 3000, // Max tokens for memory injection (default: 2000)
    "maxResults": 15, // Max search results (default: 10)
    "halfLifeDays": 45, // Time decay half-life in days (default: 30)
  },
  "display": {
    "listLimit": 30, // Default limit for list commands (default: 20)
  },
}
```

Both files are optional. If neither exists, built-in defaults are used.

### Search Memories

```bash
kizuna search "authentication flow"
kizuna list --session <session-id>
kizuna stats
kizuna prune --older-than 90
```

## Architecture

```
kizuna/
├── packages/
│   ├── kizuna-core/                 Core memory engine (SQLite + FTS5)
│   ├── kizuna-cli/                  CLI (setup, search, hooks)
│   ├── kizuna-mcp/                  MCP server (stdio transport)
│   ├── plugin-pii-sanitizer/        Redacts secrets before storage
│   └── plugin-multi-repo-sharing/   Cross-repo memory sharing
└── docs/                            Design documents and ADRs
```

### Data Flow

**Save** (on session end): Transcript JSONL -> rule-based chunking -> plugin hooks -> SQLite + FTS5

**Recall** (on each prompt): User prompt -> FTS5 search + BM25 + time decay -> plugin hooks -> formatted context injection

### Plugins

Kizuna supports plugins that hook into the capture, search, and inject pipelines:

- **pii-sanitizer** -- Automatically redacts API keys, tokens, and secrets before storage
- **multi-repo-sharing** -- Enables memory sharing across repositories via shared namespaces

See [Plugin API documentation](docs/05-plugin-api.md) for writing custom plugins.

## Development

```bash
pnpm build          # Build all packages
pnpm test           # Build + run all tests
pnpm tsc --noEmit   # Type check
pnpm lint           # ESLint
pnpm format:check   # Prettier check
```

See each package's README for package-specific details.

## Inspiration

This project is inspired by:

- [Engram](https://github.com/okamyuji/engram) by okamyuji
- [sui-memory](https://github.com/noprogllama/sui-memory) by noprogllama

## License

MIT - See [LICENSE](./LICENSE).

Copyright (c) 2026 Toshio Shiratori (@toshio-shiratori)
