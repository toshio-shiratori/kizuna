# @kizuna/plugin-multi-repo-sharing

Kizuna plugin that enables cross-repository memory search via federated queries. Each project keeps its own database while referencing other projects' databases as read-only search targets.

See the [root README](../../README.md) for full project context.

## Installation

```bash
pnpm add @kizuna/plugin-multi-repo-sharing
```

Requires `@kizuna/core` and `better-sqlite3` as peer dependencies. Requires Node.js >= 24.0.0.

## Configuration

Add to your `.kizuna/plugins.json`:

```json
{
  "plugins": {
    "multi-repo-sharing": {
      "enabled": true,
      "options": {
        "references": [
          {
            "name": "backend-api",
            "dbPath": "/path/to/other-project/.kizuna/memory.db"
          }
        ]
      }
    }
  }
}
```

Each entry in `references` declares another project's database to search alongside the local one. The `name` field is used for source attribution in search results.

References are **directional** -- if project A references project B, A can search B's memories but B cannot search A's (unless B also configures a reference to A).

## How It Works

- **`beforeSearch`** -- Captures the query text for use in federated search.
- **`afterSearch`** -- Opens each referenced database in read-only mode, executes the same FTS5 query, normalizes scores across databases using min-max normalization, and merges results sorted by score.
- **`migrations`** -- Retains the legacy namespace index for backward compatibility with existing databases.

Referenced databases are opened and closed per search request. No persistent connections are maintained.

## Score Normalization

BM25 scores from different databases are not directly comparable (different corpus sizes produce different term frequency statistics). The plugin applies min-max normalization independently to each database's result set, mapping scores to [0, 1], before merging.

## Source Attribution

Each search result is annotated with a `source` field in its `annotations`:

- `"local"` -- from the project's own database
- `"<name>"` -- from a referenced database (using the configured `name`)

## Options

| Option       | Type              | Description                                                                |
| ------------ | ----------------- | -------------------------------------------------------------------------- |
| `references` | `RepoReference[]` | List of other projects' databases to search. Each has `name` and `dbPath`. |

### RepoReference

| Field    | Type     | Description                                         |
| -------- | -------- | --------------------------------------------------- |
| `name`   | `string` | Display name for source attribution in results      |
| `dbPath` | `string` | Absolute path to the referenced project's memory.db |

## Error Handling

- Referenced databases that do not exist are skipped with a warning log.
- Referenced databases with incompatible schemas (missing `chunks_fts` table) are skipped with a warning.
- Errors from individual references do not affect the search of other references or local results.

## Migration from Shared Database Mode

The previous version of this plugin used a shared database approach with `namespace` configuration. To migrate:

1. Update your `plugins.json` to use the new `references` format (see Configuration above).
2. Remove the `namespace` option from your configuration.
3. Each project's `.kizuna/memory.db` contains only that project's memories. No data migration is needed if each project already has its own database.

## Exports

- `createMultiRepoSharing()` -- Factory function returning a fresh plugin instance.
- `multiRepoSharing` -- Pre-configured plugin instance for convenience.
- `normalizeScores()` -- Score normalization utility (exported for testing).
- `queryRemoteDb()` -- Low-level remote database query function.
- `hasCompatibleSchema()` -- Schema compatibility check utility.
- `queryReferences()` -- High-level federated query function.

## Development

```bash
pnpm build    # Compile TypeScript
pnpm test     # Run vitest
```
