# @kizuna/cli

Command-line interface for the Kizuna memory system. Sets up Claude Code hooks, searches memories, and manages the local database.

See the [root README](../../README.md) for full project context.

## Installation

```bash
pnpm add @kizuna/cli
```

Requires Node.js >= 24.0.0.

## Common Options

Most commands accept the `--cwd <path>` option to specify the project directory. When omitted, it defaults to the current working directory. The only exception is `plugin info`, which does not use a project directory.

## Commands

### `kizuna setup`

Configures Claude Code hooks for the current project. Creates `.kizuna/` and registers `SessionStart`, `SessionEnd`, `UserPromptSubmit`, and `Stop` hooks in `.claude/settings.json`. Also injects a Kizuna section into `CLAUDE.md` and deploys skill files.

```
Options:
  --cwd <path>    Project directory (default: cwd)
  --with-mcp      Also configure MCP server in settings
```

```bash
# Basic setup
kizuna setup

# Setup with MCP server
kizuna setup --with-mcp
```

### `kizuna search`

Searches stored memories using FTS5 with BM25 + time decay ranking.

```
Arguments:
  <query>         Search query (required)

Options:
  -n, --limit <number>   Maximum results (1-1000, default: 10)
  --cwd <path>           Project directory (default: cwd)
```

```bash
kizuna search "authentication flow"
kizuna search "database migration" -n 5
```

### `kizuna list`

Lists stored memory chunks, optionally filtered by session.

```
Options:
  --session <id>         Filter by session ID
  -n, --limit <number>   Maximum results (1-1000, default: 20)
  --cwd <path>           Project directory (default: cwd)
```

```bash
kizuna list
kizuna list --session abc123 -n 50
```

### `kizuna stats`

Displays database statistics: size, chunk/session counts, date range, last maintenance.

```
Options:
  --cwd <path>   Project directory (default: cwd)
```

```bash
kizuna stats
```

### `kizuna prune`

Removes chunks older than a specified number of days.

```
Options:
  --older-than <days>   Delete chunks older than N days (0-3650, required)
  --cwd <path>          Project directory (default: cwd)
```

```bash
kizuna prune --older-than 90
```

### `kizuna cleanup`

Removes low-quality or matching chunks from existing data. Supports two modes: search-based deletion with `--query` and filter-based deletion with `--apply-filters`. When neither flag is specified, filter mode is used by default. The two modes cannot be combined.

```
Options:
  --query <text>      Delete chunks matching a search query
  --apply-filters     Apply built-in and user-defined noise filters to existing chunks
  --dry-run           Show what would be deleted without actually deleting
  --yes               Skip confirmation prompt
  --cwd <path>        Project directory (default: cwd)
```

```bash
# Preview what noise filters would remove
kizuna cleanup --apply-filters --dry-run

# Delete chunks matching a search query
kizuna cleanup --query "debug log" --yes

# Apply noise filters and delete without confirmation
kizuna cleanup --apply-filters --yes
```

### `kizuna recap`

Shows session history for cross-team sharing. Supports multiple ways to select sessions: by count, by date, by ID, or by relative position.

```
Options:
  --project <path>          Target project directory (for cross-project sharing)
  --no-limit                Show all chunks without limit
  -n, --limit <number>      Maximum chunks per session from the end (1-1000, default: 5)
  -s, --sessions <number>   Number of recent sessions to show (1-100, default: 1)
  --session <id>            Show a specific session by ID (supports prefix match)
  --date <date>             Filter sessions by date (YYYY-MM-DD)
  --last <n>                Show the Nth most recent session (1-100)
  -l, --list                List sessions with chunk previews
  -v, --verbose             Show full content without truncation
  --cwd <path>              Project directory (default: cwd)
```

```bash
# Show the latest session
kizuna recap

# Show the last 3 sessions
kizuna recap -s 3

# Show a specific session by ID prefix
kizuna recap --session abc12

# Show sessions from a specific date
kizuna recap --date 2025-01-15

# Show the 2nd most recent session with full content
kizuna recap --last 2 -v

# List all sessions
kizuna recap -l

# Show recap from another project
kizuna recap --project /path/to/other-project
```

### `kizuna export`

Exports memory chunks in structured format (Markdown or JSON). Supports time range filtering, search queries, role filtering, and cross-project export via the multi-repo-sharing plugin.

```
Options:
  --since <date>            Start of time range (ISO 8601 or relative: 7d, 1w, 1m)
  --until <date>            End of time range (ISO 8601 or relative: 7d, 1w, 1m)
  --query <text>            FTS5 search filter
  --format <format>         Output format: markdown or json (default: markdown)
  -n, --limit <number>      Maximum chunks to export (1-10000, default: 100)
  --output <path>           Write output to file instead of stdout
  --clipboard               Copy output to system clipboard
  --role <role>             Filter by chunk role: user or assistant
  --min-importance <n>      Minimum importance threshold (0-10)
  --session <id>            Filter by session ID (repeatable)
  --project <name>          Export from a referenced project (multi-repo-sharing plugin)
  --no-metadata             Omit per-chunk metadata and headers from output
  --cwd <path>              Project directory (default: cwd)
```

```bash
# Export last 7 days as Markdown
kizuna export --since 7d

# Export as JSON to a file
kizuna export --format json --output memories.json

# Export user messages matching a query
kizuna export --query "API design" --role user

# Export to clipboard
kizuna export --since 1w --clipboard

# Export from a referenced project
kizuna export --project my-other-repo --since 30d
```

### `kizuna plugin`

Manages plugins. Has several subcommands.

#### `kizuna plugin list`

Lists available plugins and shows which are enabled in the current project.

```
Options:
  --cwd <path>   Project directory (default: cwd)
```

```bash
kizuna plugin list
```

#### `kizuna plugin info`

Shows detailed information about a plugin, including its options and setup example.

```
Arguments:
  <name>   Plugin name (required)
```

```bash
kizuna plugin info multi-repo-sharing
```

#### `kizuna plugin enable`

Enables a plugin for the current project. Plugin-specific options can be passed during enable.

```
Arguments:
  <name>   Plugin name (required)

Options:
  --cwd <path>          Project directory (default: cwd)
  --spec <path>         OpenAPI spec file path (openapi-awareness)
  --namespace <name>    Namespace for multi-repo sharing (deprecated)
  --alpha <number>      Balance between FTS5 and vector, 0.0-1.0 (hybrid-search)
  --max-results <n>     Maximum number of matched endpoints (openapi-awareness)
```

```bash
kizuna plugin enable pii-sanitizer
kizuna plugin enable openapi-awareness --spec ./openapi.yaml
kizuna plugin enable hybrid-search --alpha 0.7
```

#### `kizuna plugin disable`

Disables a plugin for the current project.

```
Arguments:
  <name>   Plugin name (required)

Options:
  --cwd <path>   Project directory (default: cwd)
```

```bash
kizuna plugin disable pii-sanitizer
```

#### `kizuna plugin config`

Manages plugin options. Supports the following subcommands:

- `add-reference <name> <path>` -- Add or update a reference
- `remove-reference <name>` -- Remove a reference by name
- `list-references` -- List all references
- `set <key> <value>` -- Set a scalar option

```
Arguments:
  <plugin-name>    Plugin name (required)
  <subcommand>     One of: add-reference, remove-reference, list-references, set

Options:
  --cwd <path>     Project directory (default: cwd)
```

```bash
# Add a cross-project reference
kizuna plugin config multi-repo-sharing add-reference api-server /path/to/.kizuna/memory.db

# List all references
kizuna plugin config multi-repo-sharing list-references

# Remove a reference
kizuna plugin config multi-repo-sharing remove-reference api-server

# Set a plugin option
kizuna plugin config hybrid-search set alpha 0.8
```

#### `kizuna plugin init`

Runs migrations for all enabled plugins. This is automatically called during `kizuna setup` and `kizuna plugin enable`, but can be run manually if needed.

```
Options:
  --cwd <path>   Project directory (default: cwd)
```

```bash
kizuna plugin init
```

### `kizuna hook` (internal)

Hook handlers invoked by Claude Code. Not intended for direct use.

- `session-start` -- Initializes session context.
- `session-end` -- Captures transcript into memory and runs maintenance.
- `prompt-submit` -- Injects relevant memories into prompt context.
- `stop` -- Incrementally captures new turns on assistant stop.

## Development

```bash
pnpm build    # Compile TypeScript
pnpm test     # Run vitest
```
