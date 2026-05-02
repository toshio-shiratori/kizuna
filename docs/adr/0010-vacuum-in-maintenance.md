# 0010. Add VACUUM to maintenance pipeline

**Status**: Accepted

**Date**: 2026-05-02

## Context

The maintenance pipeline defined in `04-schema.md` specifies four steps:

1. Delete old chunks
2. Cap database size (delete oldest 10% if over limit)
3. Delete empty sessions
4. WAL checkpoint (`PRAGMA wal_checkpoint(TRUNCATE)`)

During Phase 2.6 implementation, we discovered that this sequence has a flaw: SQLite does not reclaim disk space from `DELETE` operations. Deleted rows leave behind free pages in the database file. `wal_checkpoint(TRUNCATE)` only truncates the WAL file — it does not consolidate the main database file.

This causes two problems:

- **`bytesReclaimed` is always 0**: The database file size (`page_count * page_size`) does not decrease after `DELETE` without `VACUUM`, so the metric is meaningless.
- **Inaccurate size cap check**: Step 2 checks database size after step 1 (delete old chunks). Because `page_count` includes free pages, the reported size remains the same even after large deletions. This can trigger unnecessary additional deletions in step 2.

The size check can be partially fixed by using `(page_count - freelist_count) * page_size` to calculate "used" size. However, without `VACUUM`, the actual file on disk never shrinks, and accumulated free pages waste disk space over time.

## Decision

Add `VACUUM` as the final step of the maintenance pipeline, executed only when chunks or sessions were actually deleted. Also change `getDatabaseSizeBytes()` to report used size by subtracting `freelist_count` from `page_count`.

The maintenance pipeline steps become:

1. Check throttle (skip if < 24h since last run)
2. Record start size
3. Delete old chunks
4. Cap database size (using used-size calculation)
5. Delete empty sessions
6. WAL checkpoint
7. **VACUUM** (only if deletions occurred)
8. Record end size and bytes reclaimed
9. Record the maintenance run

## Rationale

### Why add VACUUM

- Without `VACUUM`, the database file grows monotonically — free pages are reused for new data but never returned to the OS
- For a personal tool running on a laptop, unbounded file growth is undesirable
- `VACUUM` rewrites the database into a compact file, actually reclaiming disk space
- The `bytesReclaimed` metric becomes meaningful

### Why conditional VACUUM (only when deletions occurred)

- `VACUUM` is expensive: it rewrites the entire database file and holds an exclusive lock
- If no data was deleted, there are no free pages to reclaim
- Skipping `VACUUM` when unnecessary avoids the performance cost for no-op maintenance runs

### Why the performance cost is acceptable

- Maintenance runs at most once per 24 hours (throttled)
- It runs during `SessionEnd` hook processing, after the Claude Code session has ended — there is no user waiting
- Target database sizes are small (5–100 MB per `04-schema.md` estimates)
- `VACUUM` on a 100 MB file takes well under 1 second on modern hardware

### Why also fix the size calculation

- `(page_count - freelist_count) * page_size` reports actual data size, not file size
- This makes the size cap check accurate even before `VACUUM` runs
- `freelist_count` is a SQLite built-in pragma with zero overhead

## Consequences

### Positive

- Database file size reflects actual data size
- `bytesReclaimed` metric is accurate
- Size cap check works correctly
- Disk space is reclaimed during routine maintenance

### Negative

- `VACUUM` holds an exclusive lock for the duration of the rewrite; concurrent readers will block (mitigated by the 5-second `busy_timeout`)
- `VACUUM` temporarily doubles disk usage (writes a new file, then replaces the old one)
- Slightly longer maintenance duration (negligible for target DB sizes)

### Changes to existing specs

- `04-schema.md` Maintenance Operations section should be updated to include `VACUUM` as a conditional final step
- The `getDatabaseSizeBytes` calculation changes from `page_count * page_size` to `(page_count - freelist_count) * page_size`
