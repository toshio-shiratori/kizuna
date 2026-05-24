# @kizuna/web

Browser-based UI for browsing, searching, and managing Kizuna memories. Launches a local Hono server with a React frontend.

See the [root README](../../README.md) for full project context.

## Usage

Start the Web UI from any project directory where Kizuna is set up:

```bash
kizuna web
```

Then open `http://localhost:4100` in your browser.

### Options

| Option          | Description             | Default |
| --------------- | ----------------------- | ------- |
| `--port <port>` | Port number             | `4100`  |
| `--write`       | Enable write operations | `false` |
| `--cwd <path>`  | Project directory       | `.`     |

Write mode (`--write`) enables chunk editing and deletion through the UI. Without it, the UI is read-only.

## Features

- **Dashboard** -- Database size, session/chunk counts, maintenance status, per-project distribution
- **Session browser** -- Session list with pagination and chunk detail view
- **Full-text search** -- FTS5 search with highlighting
- **Workflow analysis** -- Rule-based pattern detection (backtracking, repeated errors, test-fix loops, long sessions) with improvement suggestions
- **Reports** -- Intra-project analysis reports readable by Claude Code via MCP
- **Telepathy** -- Share reports with other projects via telepathy
- **Chunk editor** -- Edit importance, delete chunks (write mode only)
- **Export** -- JSON / Markdown download per session or search results

## Tech Stack

| Layer    | Technology                 |
| -------- | -------------------------- |
| Server   | Hono (`@hono/node-server`) |
| Frontend | React 19 + Tailwind CSS v4 |
| Build    | Vite 7                     |
| Language | TypeScript 5.9             |

## Development

```bash
pnpm build    # Compile TypeScript + build frontend
pnpm test     # Run vitest
```
