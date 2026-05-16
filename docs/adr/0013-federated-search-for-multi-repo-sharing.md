# 0013. Federated search for multi-repo memory sharing

**Status**: Proposed

**Date**: 2026-05-16

## Context

The current `multi-repo-sharing` plugin uses a shared database approach: multiple repositories write to and read from a single SQLite file via a configured `dbPath`. This was the initial design (validated in Phase 3 as a reference plugin; see ADR-0005), but real-world deployment to P-BANK (a frontend/backend multi-repository project) revealed structural problems that go beyond implementation bugs.

### Problems with the shared database approach

1. **Conflict with local-first principles**: The shared database requires manual `dbPath` configuration pointing to a common SQLite file. This deviates from `kizuna setup`'s zero-configuration philosophy. Note that ADR-0001 mentions shared filesystem use as a benefit of the single-file design, but does not endorse co-mingling multiple projects' data in a single database.

2. **Physical co-mingling**: Multiple projects' memories reside in one SQLite file. This makes deletion, backup, and privacy boundaries difficult to manage. Removing one project's memories requires careful filtering rather than simply deleting a file.

3. **Write contention risk**: Simultaneous writes from multiple projects depend solely on WAL mode and `busy_timeout` for correctness (as noted in ADR-0001's constraints). While this works for a single project's concurrent sessions, adding cross-project writes to the same file increases the contention surface.

4. **Fragile logical isolation**: The shared database relies on a `namespaces` filter in the search pipeline to isolate memories by project. Issue #135 revealed that this filter was never implemented — `buildFilteredQuery()` silently ignored the `namespaces` field, causing all projects' memories to appear in every search. Even if fixed, logical isolation via query filters is a single point of failure: any bug in the filter layer exposes all projects' data.

5. **Awkward asymmetric references**: Real multi-repo setups often have asymmetric reference needs (e.g., frontend references backend API decisions, but not vice versa). The symmetric namespace model makes this hard to express.

Issue #135 was closed as Won't Fix because fixing the namespace filter would address only problem 4, leaving the structural issues intact.

## Decision

Replace the shared database approach with **federated search**. The key changes:

- Each repository keeps its own `.kizuna/memory.db` as the sole writable database. No shared files.
- The `multi-repo-sharing` plugin configuration declares a list of **references** — paths to other repositories' databases that should be searched alongside the local one.
- At search time, the plugin opens referenced databases as read-only (via SQLite's `ATTACH DATABASE` or separate connections), executes the same FTS5 query against each, and merges results with the local search results.
- Writes (capture pipeline) always target the local database only. Referenced databases are never written to.

Configuration schema:

```json
{
  "plugins": {
    "multi-repo-sharing": {
      "references": [
        {
          "name": "p-bank-backend",
          "dbPath": "/path/to/p-bank-api/.kizuna/memory.db"
        }
      ]
    }
  }
}
```

The `dbPath` field now points to another project's standard database location, not a shared file. The `name` field is used for display purposes in search results (source attribution).

## Rationale

Three alternative approaches were considered:

### Alternative 1: Shared index with local data

Maintain a shared FTS5 index pointing to chunks stored in each project's local database. Rejected because keeping the index synchronized with distributed data sources introduces consistency challenges (stale entries, orphaned references) without meaningful benefit over querying the sources directly.

### Alternative 2: Pull-based synchronizer

Periodically copy relevant chunks from remote databases into the local database. Rejected because data duplication creates consistency issues (deleted memories in the source persist locally), increases storage, and requires a synchronization protocol with conflict resolution.

### Alternative 3: Fix the shared database (status quo + namespace filter)

Implement the `namespaces` filter from Issue #135 and continue with the shared database approach. Rejected because it addresses only the filter bug (problem 4) while leaving the structural problems (1–3, 5) unresolved. The physical co-mingling and write contention issues are inherent to the shared file model.

### Why federated search

Federated search aligns best with Kizuna's existing design:

- **Local-first (ADR-0001)**: Each project's database remains an independent, self-contained SQLite file. The "single file" benefit is preserved — deleting a project means deleting its `.kizuna/` directory.
- **No schema changes**: Referenced databases use the exact same schema. No new tables, no namespace metadata, no migration needed.
- **Read-only references**: SQLite supports efficient read-only access to attached databases. Write contention is eliminated because each project writes only to its own file.
- **Natural asymmetry**: The `references` list is per-project. Frontend can reference backend without backend referencing frontend. The reference relationship is explicit and directional.
- **Plugin architecture fit (ADR-0005)**: The `beforeSearch` and `afterSearch` hooks are designed for exactly this kind of query augmentation. The plugin intercepts the search, fans out to referenced databases, and merges results back.

## Consequences

### Positive

- Restores alignment with local-first principles (ADR-0001)
- Physical isolation guaranteed — each project owns its data completely
- Write contention eliminated (each project writes only to its own database)
- Asymmetric references are naturally expressed
- Privacy boundaries are clear (stop referencing a database to stop seeing its memories)
- Simpler mental model: "my database, plus I can read theirs"

### Negative

- Search latency scales with the number of referenced databases (mitigated by the small expected count — typically 1–3 references)
- BM25 scores from different databases may not be directly comparable (different corpus sizes affect term frequency statistics); cross-database score normalization is needed
- Referenced database paths must be valid on the local filesystem; this limits sharing to the same machine or a mounted filesystem
- The `dbPath` in `references` still requires manual configuration (though this is a one-time setup per reference, not a shared coordination problem)

### Constraints introduced

- The existing shared database mode (`dbPath` as a shared writable file) is a breaking change to remove. A migration guide must be provided in release notes for any users of the current approach.
- Referenced databases are opened read-only. The plugin must not attempt writes to referenced databases under any circumstances.
- The search result merge strategy (score normalization, deduplication) must be documented and tested.
