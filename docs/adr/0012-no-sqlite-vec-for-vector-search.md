# 0012. Do not use sqlite-vec for vector similarity search

**Status**: Accepted

**Date**: 2026-05-10

## Context

The hybrid search plugin (`plugin-hybrid-search`) combines FTS5 lexical search with vector similarity to improve recall. The current implementation stores embeddings as BLOBs in SQLite and computes cosine similarity in JavaScript after FTS5 returns candidates.

An alternative is [sqlite-vec](https://github.com/asg017/sqlite-vec), a SQLite extension that provides native vector operations (KNN search, distance functions) directly in SQL.

## Decision

Do not adopt sqlite-vec. Keep the current approach of BLOB storage + in-memory JavaScript cosine similarity.

## Rationale

### Performance is not a bottleneck

Benchmark results from #85 show the core search pipeline handles 5,000 chunks in under 3ms. The hybrid search plugin only computes cosine similarity on the FTS5 result set (typically 10-20 candidates), not the full corpus. In-memory computation on this scale is negligible.

### Native extension adds installation complexity

sqlite-vec is a loadable SQLite extension requiring platform-specific binaries. This conflicts with design principle #6 (minimal dependencies) and would complicate installation on macOS, Linux, and CI environments. better-sqlite3 is already the only native dependency; adding another raises the maintenance burden.

### The two-phase approach is sufficient

The current architecture — FTS5 narrows candidates, then vector similarity reranks — avoids the need for full-corpus KNN search. sqlite-vec's primary advantage (efficient KNN over large vector sets) is unnecessary when the candidate set is already small.

### When to revisit

- If the chunk corpus grows beyond 50,000 and FTS5 candidate sets regularly exceed 100 results
- If sqlite-vec gains first-class support in better-sqlite3 (eliminating the separate extension install)
- If a use case requires pure vector search without FTS5 pre-filtering

## Consequences

- Embedding storage remains as BLOBs in a simple table (`hybrid_search_embeddings`)
- Vector similarity is computed in JavaScript, keeping the dependency footprint minimal
- No platform-specific binary beyond better-sqlite3 is required
