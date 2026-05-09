# @kizuna/mcp

MCP (Model Context Protocol) server for Kizuna. Provides bidirectional memory access for Claude Code sessions via stdio transport.

See the [root README](../../README.md) for full project context.

## Installation

```bash
pnpm add @kizuna/mcp
```

Requires Node.js >= 24.0.0.

## Usage

The server requires the `KIZUNA_DB_PATH` environment variable:

```bash
KIZUNA_DB_PATH=/path/to/.kizuna/memory.db kizuna-mcp
```

Register with Claude Code by adding to your MCP configuration:

```json
{
  "mcpServers": {
    "kizuna": {
      "command": "node",
      "args": ["/path/to/kizuna/packages/kizuna-mcp/dist/main.js"],
      "env": { "KIZUNA_DB_PATH": "/path/to/.kizuna/memory.db" }
    }
  }
}
```

## MCP Tools

| Tool            | Description                                                                         |
| --------------- | ----------------------------------------------------------------------------------- |
| `kizuna_search` | Search memories by query text (params: `query`, `limit`)                            |
| `kizuna_save`   | Manually save a memory chunk (params: `content`, `role`, `sessionId`, `importance`) |
| `kizuna_list`   | List recent chunks, optionally by session (params: `sessionId`, `limit`)            |
| `kizuna_delete` | Delete chunks by ID (params: `ids`)                                                 |

Plugin-provided MCP tools are also registered automatically if a `PluginManager` is provided.

## Exports

- `createServer(options)` -- Creates an `McpServer` instance. Accepts `dbPath` and optional `pluginManager`.

## Development

```bash
pnpm build    # Compile TypeScript
pnpm test     # Run vitest
```
