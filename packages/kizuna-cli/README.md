# @kizuna/cli

Command-line interface for the Kizuna memory system. Sets up Claude Code hooks, searches memories, and manages the local database.

See the [root README](../../README.md) for full project context.

## Installation

```bash
pnpm add @kizuna/cli
```

Requires Node.js >= 24.0.0.

## Commands

### `kizuna setup [--cwd <path>]`

Configures Claude Code hooks for the current project. Creates `.kizuna/` and registers `SessionStart`, `SessionEnd`, and `UserPromptSubmit` hooks in `.claude/settings.json`.

### `kizuna search <query> [-n 10] [--cwd <path>]`

Searches stored memories using FTS5 with BM25 + time decay ranking.

### `kizuna list [--session <id>] [-n 20] [--cwd <path>]`

Lists stored memory chunks, optionally filtered by session.

### `kizuna stats [--cwd <path>]`

Displays database statistics: size, chunk/session counts, date range, last maintenance.

### `kizuna prune --older-than <days> [--cwd <path>]`

Removes chunks older than a specified number of days.

### `kizuna hook` (internal)

Hook handlers invoked by Claude Code. Not intended for direct use.

- `session-start` -- Shows memory stats at session start.
- `session-end` -- Captures transcript into memory and runs maintenance.
- `prompt-submit` -- Injects relevant memories into prompt context.

## Development

```bash
pnpm build    # Compile TypeScript
pnpm test     # Run vitest
```
