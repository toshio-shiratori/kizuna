# SQLite Schema Specification

This document defines the SQLite schema used by Kizuna's core. Plugin-specific tables are defined separately by each plugin.

## Design Goals

The schema is designed for:

1. **Simple queries**: Most operations should be single-table queries
2. **FTS5 integration**: Full-text search via SQLite's FTS5 with trigram tokenizer (CJK-aware)
3. **Plugin extensibility**: A flexible JSON metadata column allows plugins to add attributes without schema changes
4. **Migration support**: Schema versioning is built in from day one
5. **Query performance**: Appropriate indexes on frequent query patterns

## Database Configuration

Connection settings applied at startup:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA busy_timeout = 5000;
PRAGMA foreign_keys = ON;
```

Rationale:

- **WAL mode**: Enables concurrent read/write across processes
- **synchronous=NORMAL**: Reasonable balance of durability and performance
- **busy_timeout=5000**: 5 seconds before failing on lock contention
- **foreign_keys=ON**: Enforces referential integrity

## Core Tables

### `schema_versions`

Tracks applied migrations. Used by both core and plugins.

```sql
CREATE TABLE schema_versions (
  component TEXT NOT NULL,
  version INTEGER NOT NULL,
  applied_at TEXT NOT NULL,
  PRIMARY KEY (component, version)
);
```

| Column     | Type    | Description                                                   |
| ---------- | ------- | ------------------------------------------------------------- |
| component  | TEXT    | `"core"` or plugin name like `"@kizuna/plugin-pii-sanitizer"` |
| version    | INTEGER | Migration version number                                      |
| applied_at | TEXT    | ISO 8601 timestamp                                            |

### `sessions`

One row per Claude Code session.

```sql
CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  transcript_path TEXT,
  metadata TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX idx_sessions_project_started
  ON sessions(project_id, started_at DESC);
```

| Column          | Type         | Description                                         |
| --------------- | ------------ | --------------------------------------------------- |
| id              | TEXT         | Session UUID (provided by Claude Code)              |
| project_id      | TEXT         | Identifier of the project (from kizuna config)      |
| started_at      | TEXT         | ISO 8601 timestamp                                  |
| ended_at        | TEXT \| NULL | ISO 8601 timestamp; NULL while active               |
| transcript_path | TEXT \| NULL | Path to the original transcript JSONL (if retained) |
| metadata        | TEXT         | JSON object for plugin extensions                   |

### `chunks`

The primary memory storage. Each chunk is a discrete piece of memorable content extracted from a session.

```sql
CREATE TABLE chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  turn_index INTEGER NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  importance INTEGER NOT NULL DEFAULT 5 CHECK (importance BETWEEN 0 AND 10),
  created_at TEXT NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_chunks_session_turn
  ON chunks(session_id, turn_index);

CREATE INDEX idx_chunks_created_at
  ON chunks(created_at DESC);

CREATE INDEX idx_chunks_importance
  ON chunks(importance DESC, created_at DESC);
```

| Column      | Type    | Description                           |
| ----------- | ------- | ------------------------------------- |
| id          | INTEGER | Auto-increment primary key            |
| session_id  | TEXT    | Foreign key to sessions               |
| turn_index  | INTEGER | Order within the session (0-based)    |
| role        | TEXT    | Either `"user"` or `"assistant"`      |
| content     | TEXT    | The actual content of the chunk       |
| token_count | INTEGER | Approximate token count for budgeting |
| importance  | INTEGER | 0-10, default 5; used for ranking     |
| created_at  | TEXT    | ISO 8601 timestamp                    |
| metadata    | TEXT    | JSON object for plugin extensions     |

The `metadata` column is intentionally a flexible JSON store. Plugins use this to attach arbitrary attributes (e.g., `repo_id`, `namespace`, `extracted_entities`, `pii_redacted`) without requiring schema changes.

### `chunks_fts` (Virtual Table)

Full-text search index over chunk content using FTS5 with the trigram tokenizer.

```sql
CREATE VIRTUAL TABLE chunks_fts USING fts5(
  content,
  content=chunks,
  content_rowid=id,
  tokenize='trigram'
);

CREATE TRIGGER chunks_fts_insert AFTER INSERT ON chunks BEGIN
  INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER chunks_fts_delete AFTER DELETE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
END;

CREATE TRIGGER chunks_fts_update AFTER UPDATE ON chunks BEGIN
  INSERT INTO chunks_fts(chunks_fts, rowid, content) VALUES('delete', old.id, old.content);
  INSERT INTO chunks_fts(rowid, content) VALUES (new.id, new.content);
END;
```

The trigram tokenizer enables CJK (Chinese/Japanese/Korean) text search without requiring an external tokenizer or dictionary. This was a critical fix in Engram for Japanese support.

### `plugin_kv`

Per-plugin key-value storage for plugin state and configuration.

```sql
CREATE TABLE plugin_kv (
  plugin_name TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (plugin_name, key)
);
```

| Column      | Type | Description                                                     |
| ----------- | ---- | --------------------------------------------------------------- |
| plugin_name | TEXT | Plugin identifier (e.g., `"@kizuna/plugin-multi-repo-sharing"`) |
| key         | TEXT | Key within the plugin's namespace                               |
| value       | TEXT | JSON-encoded value                                              |
| updated_at  | TEXT | ISO 8601 timestamp                                              |

Plugins use this to store any state they need without defining their own tables. For larger or more structured data, plugins may define their own tables via migrations (see Plugin API).

### `maintenance_runs`

Tracks when maintenance operations have run, to enforce the 24-hour throttle.

```sql
CREATE TABLE maintenance_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ran_at TEXT NOT NULL,
  chunks_deleted INTEGER NOT NULL DEFAULT 0,
  sessions_deleted INTEGER NOT NULL DEFAULT 0,
  bytes_reclaimed INTEGER NOT NULL DEFAULT 0,
  duration_ms INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_maintenance_runs_ran_at
  ON maintenance_runs(ran_at DESC);
```

## JSON Metadata Conventions

The `metadata` columns on `sessions` and `chunks` are flexible JSON stores. To prevent collisions between plugins, the following conventions apply:

- **Core fields**: At the top level, e.g., `{"language": "ja"}`
- **Plugin fields**: Namespaced under the plugin name, e.g., `{"@kizuna/plugin-multi-repo-sharing": {"namespace": "fe-be-shared"}}`

Example chunk metadata:

```json
{
  "language": "ja",
  "@kizuna/plugin-pii-sanitizer": {
    "redacted_count": 2,
    "redacted_types": ["email", "api_key"]
  },
  "@kizuna/plugin-multi-repo-sharing": {
    "repo_id": "fe-app",
    "namespace": "shared"
  }
}
```

## Migration Strategy

### Core Migrations

Core migrations live in `packages/kizuna-core/src/storage/migrations/` as numbered SQL files:

```
001-initial.sql
002-add-importance-default.sql
003-add-language-metadata.sql
```

Each migration is wrapped in a transaction and recorded in `schema_versions` with `component='core'`.

### Plugin Migrations

Plugins declare their migrations via the `migrations()` method of the plugin API. Each plugin manages its own version sequence, recorded with `component='@plugin-name'`.

Plugin migrations are applied:

- On first plugin activation
- When the plugin version changes
- Before any plugin code runs

If a plugin migration fails, the plugin is disabled with an error logged. Other plugins and the core continue to function.

## Search Query Pattern

The standard search query combines FTS5 BM25 with time decay:

```sql
SELECT
  c.id,
  c.content,
  c.created_at,
  c.importance,
  c.metadata,
  bm25(chunks_fts) AS bm25_score,
  -- Time decay: half-life of 30 days (configurable)
  exp(-0.693 * (julianday('now') - julianday(c.created_at)) / 30.0) AS time_decay
FROM chunks_fts
JOIN chunks c ON chunks_fts.rowid = c.id
WHERE chunks_fts MATCH ?
ORDER BY (bm25_score * time_decay * (1 + c.importance / 10.0)) DESC
LIMIT ?;
```

The exact ranking formula is configurable per project via the global config.

## Maintenance Operations

The maintenance pipeline performs (in order):

1. **Delete old chunks**: `DELETE FROM chunks WHERE created_at < datetime('now', '-90 days')` (threshold configurable)
2. **Cap database size**: If used size exceeds limit, delete oldest 10% of chunks. Used size is calculated as `(page_count - freelist_count) * page_size` to exclude free pages from the count.
3. **Delete empty sessions**: `DELETE FROM sessions WHERE id NOT IN (SELECT DISTINCT session_id FROM chunks)`
4. **Vacuum WAL**: `PRAGMA wal_checkpoint(TRUNCATE)` to flush WAL
5. **VACUUM**: `VACUUM` to reclaim disk space (only if chunks or sessions were deleted in steps 1-3). See ADR-0010 for rationale.

Recorded in `maintenance_runs` with metrics for observability.

## Backup and Export

Kizuna does NOT implement automatic backups. Users are expected to either:

- Place the database in a backed-up location (Dropbox, Time Machine, etc.)
- Use Kizuna's export commands to dump to JSON/Markdown periodically

Export commands (provided by `kizuna-cli`):

- `kizuna export --format json` → JSON dump of all chunks
- `kizuna export --format markdown` → Human-readable Markdown
- `kizuna backup --file <path>` → SQLite copy via `VACUUM INTO`

## Database Size Estimates

Rough estimates for capacity planning:

| Usage Pattern                | Chunks/day | DB size after 90 days |
| ---------------------------- | ---------- | --------------------- |
| Light (1-2 sessions/day)     | ~50        | ~5 MB                 |
| Moderate (5-10 sessions/day) | ~250       | ~25 MB                |
| Heavy (20+ sessions/day)     | ~1000      | ~100 MB               |

These assume average chunk content of ~500 characters. The default 100 MB cap accommodates heavy usage with the 90-day retention.

## Future Schema Changes

Anticipated future additions, not yet in scope:

- **Vector embeddings table**: For the optional hybrid-search plugin (uses `sqlite-vec`)
- **Tags table**: For user-applied tags (currently lives in metadata JSON)
- **References table**: For cross-references between chunks (e.g., "this decision supersedes that one")

These will be added via migrations when their respective features are implemented.
