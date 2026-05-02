# 0001. Use SQLite as the storage backend

**Status**: Accepted

**Date**: 2026-05-02

## Context

Kizuna needs persistent storage for memory chunks, sessions, and plugin state. The choice of storage backend affects almost every aspect of the system: dependencies, deployment, performance, concurrency, and operational complexity.

The relevant constraints from the design principles are:

- **No external dependencies** (Principle 1): Storage must not require an external service or daemon
- **Minimal dependencies** (Principle 6): The dependency tree should be shallow
- **DB bloat prevention** (Principle 7): The storage must support efficient cleanup
- **Local-first**: All data stays on the user's machine

The system also needs:

- Full-text search (for the search pipeline)
- Concurrent access from multiple processes (multiple Claude Code sessions running simultaneously)
- Reasonable performance for both writes (capture) and reads (search)
- Single-file portability (for shared filesystem scenarios)

Alternatives considered:

1. **SQLite** with FTS5
2. **JSON files** with manual indexing
3. **DuckDB** as an embedded analytical database
4. **Embedded key-value store** (LevelDB, RocksDB)
5. **PostgreSQL** as a server

## Decision

Use SQLite as the sole storage backend, with FTS5 for full-text search. Connection is via the `better-sqlite3` library.

WAL mode is enabled for concurrent multi-process access. Foreign keys are enforced.

## Rationale

### Why SQLite

- **Zero operational cost**: SQLite is a library, not a server. No daemon to manage, no port to configure.
- **Single file**: The entire database is one file, making backup, sharing via filesystem, and inspection trivial.
- **Mature concurrency support**: WAL mode handles multiple readers and a writer cleanly. The `busy_timeout` PRAGMA handles edge cases.
- **FTS5 is excellent**: SQLite's FTS5 with the trigram tokenizer handles CJK languages without external dependencies. Engram demonstrated this works well for Japanese.
- **Universal availability**: SQLite is on every platform Kizuna needs to support.
- **Long history of stability**: SQLite has well-known performance characteristics and decades of production use.
- **Compatible with future hybrid search**: The optional sqlite-vec extension allows adding vector search later without changing the database.

### Why not JSON files

- No efficient full-text search without re-implementing one
- Concurrent access requires file locking, which is error-prone
- Range queries and aggregations require loading everything into memory
- Schema evolution is harder without DDL statements

### Why not DuckDB

- DuckDB is excellent for analytical queries but not optimized for the write-heavy, point-query workload Kizuna has
- Less battle-tested for concurrent multi-process write scenarios
- Larger binary footprint
- Full-text search support is less mature

### Why not LevelDB/RocksDB

- These are key-value stores; full-text search requires building it on top
- Complex operations like joins or aggregations require manual implementation
- Less ergonomic for the data model (sessions, chunks, metadata)

### Why not PostgreSQL

- Requires running a server, violating Principle 1
- Adds significant operational complexity for users
- Overkill for the data sizes involved (target: 100 MB)

## Consequences

### Positive

- Single dependency for the core (`better-sqlite3`)
- Trivial backup (copy the file)
- Trivial sharing across machines via shared filesystem (NAS, Dropbox)
- Native FTS5 with CJK support via trigram tokenizer
- Synchronous API of `better-sqlite3` simplifies the codebase (no async pollution for storage)
- Works on all platforms Kizuna targets

### Negative

- Synchronous API can block the Node.js event loop for very large queries; mitigation is to keep query result sets bounded
- WAL mode requires the database file's parent directory to be writable (occasional issue on read-only filesystems)
- `better-sqlite3` is a native module that requires compilation on install; users on unsupported architectures may have issues

### Constraints introduced

- All schema changes must be expressed as migrations (no ad-hoc schema changes)
- The 100 MB target size assumes SQLite's storage characteristics; significantly larger databases would need a different design
- Cross-process concurrency depends on filesystem support for SQLite's locking; some network filesystems do not support this reliably

## Implementation Notes

Connection pragmas applied at startup are documented in `docs/04-schema.md`. The schema and migration strategy are also documented there.

For shared multi-repository scenarios where the SQLite file lives on a network filesystem, users are advised to verify that their filesystem supports SQLite's locking. On macOS, network filesystems like NFS may have issues; SMB and local filesystems work reliably. Cloud sync services (Dropbox, iCloud) may cause issues if multiple machines write simultaneously.
