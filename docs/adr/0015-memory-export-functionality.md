# 0015. Memory export functionality

**Status**: Proposed

**Date**: 2026-05-16

## Context

Kizuna currently provides `kizuna search` for query-based retrieval and `kizuna list` for session/chunk enumeration, but there is no command to export a structured range of memories in a format suitable for external consumption.

Four use cases motivate this feature:

1. **Weekly/monthly review**: Retrieve memories in bulk by time range for retrospective analysis
2. **Information sharing with external systems**: Paste memory excerpts into GitHub Issues/PRs or documentation tools
3. **Archive and backup**: Periodic record keeping in a human-readable format
4. **Context sharing with external agents (e.g., claude.ai)**: Bring Kizuna's context into agents that lack stdio MCP support or local filesystem access

Use case 4 is particularly significant because claude.ai has no stdio MCP connection and no local filesystem access. An export command that outputs formatted text is effectively the only practical bridge.

### Design questions

This ADR resolves five design questions identified in Issue #145:

1. Should the export feature live in core or in a plugin?
2. Which output formats should be supported?
3. Should a summary mode be included, and if so, how does it respect ADR-0007?
4. What filtering options should be available at export time?
5. What output destinations and ergonomic conveniences should be provided?

## Decision

### 1. Placement: in core

The export feature is placed in `kizuna-core` and exposed as a CLI command (`kizuna export`).

### 2. Output formats: Markdown and JSON

Two formats are supported:

- **Markdown** (default): Human-readable, structured with headers and metadata. Suitable for pasting into GitHub Issues, PRs, chat interfaces, or other documentation tools.
- **JSON**: Machine-readable, suitable for piping to external tools, scripting, and programmatic consumption.

### 3. Summary mode: excluded from initial scope

No summary mode in the initial implementation. The export command outputs raw memory chunks with their metadata. Statistical aggregation (chunk counts, date ranges) is provided as metadata in the export header, not as a separate summary mode.

### 4. Filtering scope

Export supports the following filters, reusing the existing `SearchFilters` infrastructure:

| Filter             | Flag                       | Description                                        |
| ------------------ | -------------------------- | -------------------------------------------------- |
| Time range (start) | `--since <date>`           | ISO 8601 date or relative (e.g., `7d`, `1w`, `1m`) |
| Time range (end)   | `--until <date>`           | ISO 8601 date or relative                          |
| Query text         | `--query <text>`           | FTS5 search-based narrowing                        |
| Role               | `--role <user\|assistant>` | Filter by chunk role                               |
| Minimum importance | `--min-importance <n>`     | Filter by importance threshold (0-10)              |
| Session ID         | `--session <id>`           | Export specific session(s)                         |
| Limit              | `--limit <n>`              | Maximum number of chunks (default: 100)            |

When `--query` is specified, chunks are ranked by the existing search pipeline (BM25 + time decay + importance). When `--query` is omitted, chunks are ordered chronologically (newest first).

### 5. Output destinations

| Destination | Flag              | Behavior                                                    |
| ----------- | ----------------- | ----------------------------------------------------------- |
| Stdout      | (default)         | Print to stdout                                             |
| File        | `--output <path>` | Write to file                                               |
| Clipboard   | `--clipboard`     | Copy to system clipboard (macOS: pbcopy, Linux: xclip/xsel) |

### CLI interface

```
kizuna export [options]

Options:
  --format <markdown|json>     Output format (default: markdown)
  --since <date>               Start of time range
  --until <date>               End of time range
  --query <text>               FTS5 search filter
  --role <user|assistant>      Filter by role
  --min-importance <n>         Minimum importance (0-10)
  --session <id>               Filter by session ID (repeatable)
  --limit <n>                  Max chunks to export (default: 100)
  --output <path>              Write to file instead of stdout
  --clipboard                  Copy to clipboard
  --no-metadata                Omit chunk metadata (timestamps, importance, session)
```

### Markdown output format

```markdown
# Kizuna Memory Export

- **Project**: <project-id>
- **Exported**: <timestamp>
- **Chunks**: <count>
- **Date range**: <oldest> — <newest>
- **Filters**: <applied filters summary>

---

## [<timestamp>] <role> (session: <short-id>, importance: <n>)

<content>

---

## [<timestamp>] <role> (session: <short-id>, importance: <n>)

<content>

...
```

With `--no-metadata`:

```markdown
# Kizuna Memory Export

---

<content>

---

<content>

...
```

### JSON output format

```json
{
  "meta": {
    "projectId": "<project-id>",
    "exportedAt": "<timestamp>",
    "chunkCount": 42,
    "dateRange": { "from": "<oldest>", "to": "<newest>" },
    "filters": { ... }
  },
  "chunks": [
    {
      "id": 123,
      "sessionId": "<id>",
      "role": "assistant",
      "content": "...",
      "importance": 7,
      "createdAt": "<timestamp>",
      "metadata": { ... }
    }
  ]
}
```

## Rationale

### Why in core (not a plugin)

Per ADR-0005's "In core vs plugins" criteria:

- **Universally useful**: Every Kizuna user benefits from export capability. It is not project-specific or domain-specific.
- **No new dependencies**: Export uses only existing core infrastructure (Database, search pipeline, formatting). No external libraries are needed.
- **Analogous to existing core commands**: `search`, `list`, `prune`, and `stats` are all in core. Export is a natural extension of `list` with formatting and filtering.
- **The core already has all necessary building blocks**: `SearchFilters`, `searchMemory()`, `Database.listChunks()` provide the data access. Only formatting logic is new.

A plugin would be warranted if format extensibility (custom output formats) were a primary requirement. However, the two formats chosen (Markdown, JSON) cover the identified use cases comprehensively. If a niche format (CSV, YAML, org-mode) is needed in the future, a plugin can add it by reusing the core export's data retrieval and providing its own formatter.

### Why Markdown and JSON (not YAML, CSV, or others)

- **Markdown**: The primary use case (pasting into GitHub, claude.ai, documentation) is best served by Markdown. It renders natively in GitHub, is readable as plain text, and preserves structure.
- **JSON**: The standard machine-readable format for structured data. Enables piping to `jq`, consumption by scripts, and integration with external tools.
- **Not YAML**: YAML offers no advantage over JSON for machine consumption and is harder to parse correctly. For human readability, Markdown is superior.
- **Not CSV**: Memory chunks contain multi-line content with rich structure. CSV cannot represent this without lossy escaping.
- **Not plain text**: Loses structural information (metadata, session boundaries) that makes exported memories useful.

### Why no summary mode (Option C from Issue #145)

ADR-0007 prohibits LLM usage in core. The remaining options are:

- **Option A (rule-based statistics)**: Chunk counts, frequent keywords, date ranges. These are already provided in the export header metadata. A separate "summary mode" for just statistics adds command-surface complexity for minimal value.
- **Option B (summary prompt template)**: Generate a prompt that the user pastes into an LLM. This is clever but fragile — prompt templates become stale, and the UX of "export a prompt, paste it elsewhere, get a summary" is worse than "export the raw data, let the receiving agent summarize it directly."

The pragmatic path: export raw chunks with metadata. The receiving system (claude.ai, a human reviewer, a script) can summarize as it sees fit. This keeps the core simple and avoids scope creep.

### Why reuse SearchFilters

The existing `SearchFilters` interface in `kizuna-core` already supports `sessionIds`, `projectIds`, `minImportance`, `createdAfter`, and `createdBefore`. The `searchMemory()` pipeline handles these filters with full FTS5 integration.

Export adds only one new filter dimension: `role` (user/assistant). This is a simple WHERE clause addition, not a new search paradigm.

Reusing the existing infrastructure means:

- No code duplication between search and export
- Filter behavior is consistent across commands
- Bug fixes to search filtering automatically benefit export
- Plugin hooks (`beforeSearch`, `afterSearch`) apply to query-based exports

### Why clipboard support

Use case 4 (context sharing with claude.ai) involves a repetitive workflow: export → select all → copy → paste into browser. The `--clipboard` flag eliminates the middle steps. On macOS (the project owner's platform), `pbcopy` is universally available. Linux support via `xclip`/`xsel` is best-effort.

## Consequences

### Positive

- Users can retrieve memories in bulk for review, sharing, and archival
- The claude.ai bridge use case is directly supported
- No new dependencies in core
- Consistent filtering with existing search command
- Scriptable via JSON output and standard Unix piping
- Clipboard support reduces friction for the primary use case

### Negative

- Adds a new CLI command to learn and maintain
- The `--limit` default (100) requires awareness when exporting large date ranges — users must explicitly increase if needed
- Clipboard support introduces platform-specific code paths (pbcopy vs xclip) — mitigated by treating clipboard failure as a non-fatal warning with stdout fallback
- Role filtering (`--role`) is a new filter dimension not present in `SearchFilters` — requires a minor extension to the interface or post-query filtering

### Constraints introduced

- The Markdown format becomes a quasi-stable interface: external tools or workflows may depend on its structure. Changes to the format should be backward-compatible or versioned.
- The `--limit` default must balance "useful default for pasting" against "not overwhelming the clipboard/stdout." 100 chunks is a reasonable starting point but may need adjustment based on usage.
- Relative date parsing (`7d`, `1w`, `1m`) introduces a small parsing utility that must handle edge cases consistently.

## Implementation Phases

After this ADR is accepted, implementation proceeds as:

- **Phase 1**: Basic export (`--since`, `--until`, `--query`, `--limit`, `--format`, stdout output)
- **Phase 2**: Ergonomic improvements (`--output`, `--clipboard`, `--role`, `--min-importance`, `--session`, `--no-metadata`)
- **Phase 3**: Integration with multi-repo plugin (export from referenced databases via `--project`)

Each phase is tracked as a separate GitHub Issue.
