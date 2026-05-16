# Architecture Decision Records (ADRs)

This directory contains Architecture Decision Records — short documents capturing significant decisions made during Kizuna's development.

## What is an ADR?

An ADR is a record of a significant architectural decision. Each ADR captures:

- **The context** in which the decision was made
- **The decision** itself
- **The rationale** for choosing this option over alternatives
- **The consequences** that follow from the decision

ADRs are immutable. Once accepted, they are not modified. If a decision changes, a new ADR is created that supersedes the old one. The old one is marked "Superseded" but remains in the repository for historical reference.

## Why Use ADRs?

Software projects accumulate decisions that seem obvious at the time but are mysterious months or years later:

- _Why did we choose SQLite instead of PostgreSQL?_
- _Why is the plugin API based on object methods rather than functions?_
- _Why don't we use vector embeddings in the core?_

Without ADRs, these questions are answered by guesswork or rediscovery. With ADRs, the original reasoning is preserved.

ADRs are particularly important for AI-assisted development. Claude Code CLI and similar tools cannot infer historical context. When they make design choices, they need access to the existing decisions to avoid contradicting them.

## When to Write an ADR

Write an ADR when:

- A decision affects the architecture (not just implementation details)
- A reasonable person could have chosen differently
- Future contributors will likely ask "why did we do it this way?"
- The decision constrains future work

Do NOT write an ADR for:

- Routine implementation choices (variable names, function signatures)
- Decisions that are obviously correct given the constraints
- Tactical decisions that will be revisited frequently

## ADR Format

Each ADR is a Markdown file named `NNNN-short-title.md` where `NNNN` is a zero-padded sequence number.

The format follows a simplified version of Michael Nygard's template:

```markdown
# NNNN. Title

**Status**: Proposed | Accepted | Superseded by ADR-XXXX

**Date**: YYYY-MM-DD

## Context

What is the situation that calls for a decision? What forces are at play?

## Decision

What is the change being proposed or made?

## Rationale

Why this decision over alternatives? What were the alternatives considered?

## Consequences

What becomes easier? What becomes harder? What new constraints are introduced?
```

## Index of ADRs

| ID                                                        | Title                                              | Status   |
| --------------------------------------------------------- | -------------------------------------------------- | -------- |
| [0001](./0001-use-sqlite.md)                              | Use SQLite as the storage backend                  | Accepted |
| [0002](./0002-use-typescript.md)                          | Use TypeScript as the implementation language      | Accepted |
| [0003](./0003-use-monorepo.md)                            | Use pnpm workspaces monorepo structure             | Accepted |
| [0004](./0004-use-mise.md)                                | Use mise for development environment management    | Accepted |
| [0005](./0005-plugin-architecture.md)                     | Adopt a plugin architecture for extensibility      | Accepted |
| [0006](./0006-mit-license.md)                             | Use MIT license                                    | Accepted |
| [0007](./0007-no-llm-in-core.md)                          | No LLM dependency in the core                      | Accepted |
| [0008](./0008-hook-based-capture.md)                      | Use Claude Code hooks for capture and recall       | Accepted |
| [0009](./0009-fts5-with-cjk-ngram.md)                     | Use FTS5 trigram tokenizer with CJK n-gram         | Accepted |
| [0010](./0010-vacuum-in-maintenance.md)                   | Run VACUUM in maintenance cycle                    | Accepted |
| [0011](./0011-actionable-memory-injection.md)             | Use action directives in memory injection          | Accepted |
| [0012](./0012-no-sqlite-vec-for-vector-search.md)         | Do not use sqlite-vec for vector similarity search | Accepted |
| [0013](./0013-federated-search-for-multi-repo-sharing.md) | Federated search for multi-repo memory sharing     | Accepted |
| [0014](./0014-cli-plugin-config-command.md)               | CLI plugin config command for structured options   | Accepted |
| [0015](./0015-memory-export-functionality.md)             | Memory export functionality                        | Accepted |

## How to Add a New ADR

1. Identify the next available number (currently 0016)
2. Create `NNNN-short-title.md` in this directory
3. Follow the format above
4. Status starts as "Proposed"
5. After review by the project owner, update to "Accepted" (or revise based on feedback)
6. Add to the index table in this README
7. Commit with a message like `docs(adr): add ADR-NNNN for <topic>`

## How to Supersede an ADR

If a decision changes:

1. Create a new ADR documenting the new decision and explaining why the old one no longer applies
2. Update the old ADR's status to "Superseded by ADR-NNNN"
3. Do NOT delete or modify the old ADR's content beyond the status field
4. Update the index table to reflect the new statuses

## Reading Order for New Contributors

If you are reading these ADRs to understand Kizuna's design, the recommended order is:

1. **0001 (SQLite)** — Foundational storage choice
2. **0002 (TypeScript)** — Implementation language
3. **0007 (No LLM in core)** — A critical constraint that shapes everything
4. **0008 (Hook-based capture)** — How Kizuna integrates with Claude Code
5. **0005 (Plugin architecture)** — How extensibility is achieved
6. **Others** — Read as needed

Reading the design principles document (`docs/02-design-principles.md`) before the ADRs is also recommended.
