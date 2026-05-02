# Development Roadmap

This document defines Kizuna's phased development plan. Each phase has clear entry conditions, deliverables, and exit criteria.

## How to Use This Document

This roadmap serves two purposes:

1. **For the project owner**: A checklist for tracking progress
2. **For Claude Code CLI**: An authoritative work plan that defines what to build, in what order, and how to know when each phase is complete

When working on Kizuna with Claude Code CLI, refer to the current phase. Do NOT implement features from later phases prematurely. YAGNI applies strictly — over-engineering is a frequent failure mode for AI-assisted development.

## Phase Overview

| Phase | Goal | Status |
|-------|------|--------|
| Phase 0 | Project initialization | ✅ Complete |
| Phase 1 | Documentation | ✅ Complete |
| Phase 2 | Core implementation | 🚧 In progress |
| Phase 3 | Plugin system | ⏳ Pending |
| Phase 4 | Public release preparation | ⏳ Pending |
| Phase 5 | Extensions and ecosystem | ⏳ Future |

---

## Phase 0: Project Initialization

**Status: Complete**

### Goal

Establish a clean repository with development environment, monorepo structure, and project metadata.

### Deliverables

- ✅ GitHub repository created (private)
- ✅ Local development environment (mise + Node.js v24 LTS + pnpm 11)
- ✅ CLAUDE.md with project instructions
- ✅ Standard project files (`.gitignore`, `.editorconfig`, `LICENSE`, `README.md`)
- ✅ Monorepo configuration (`pnpm-workspace.yaml`, root `package.json`, `tsconfig.base.json`)
- ✅ GitHub configuration (`.github/ISSUE_TEMPLATE/config.yml`)
- ✅ Empty `docs/` and `packages/` directories

---

## Phase 1: Documentation

**Status: Complete**

### Goal

Document the project's vision, design principles, architecture, and decisions clearly enough that future contributors (including Claude Code CLI sessions) can understand the project without re-deriving them.

### Deliverables

- ✅ `docs/01-vision.md` — Project vision and use cases
- ✅ `docs/02-design-principles.md` — The eight design principles
- ✅ `docs/03-architecture.md` — High-level architecture
- ✅ `docs/04-schema.md` — SQLite schema specification
- ✅ `docs/05-plugin-api.md` — Plugin API specification
- ✅ `docs/06-roadmap.md` — This document
- ✅ `docs/07-references.md` — External references and acknowledgments
- ✅ `docs/adr/` — Architecture Decision Records (9 ADRs)
- ✅ `docs/README.md` — Documentation reading guide

### Exit Criteria

- All documentation files committed to the repository
- A new contributor can read `docs/README.md` and understand what to read next
- Each significant design decision has an ADR

---

## Phase 2: Core Implementation

**Status: In progress**

### Goal

Implement the minimum viable Kizuna: a working memory system that captures and recalls without any plugin support. This phase produces a usable tool, even if limited.

### Entry Conditions

- Phase 1 complete (documentation exists)
- Architecture document and schema document reviewed and stable

### Deliverables (in implementation order)

#### 2.1 Package skeleton

- Create `packages/kizuna-core/` with package.json, tsconfig.json, vitest.config
- Establish the package's directory structure: `src/storage/`, `src/pipelines/`, `src/config/`
- Add a placeholder `src/index.ts` exporting types

**Validation**: `pnpm tsc --noEmit` passes from the repo root

#### 2.2 Storage layer

- Implement SQLite connection with WAL mode and pragmas
- Implement core schema migrations (the tables defined in `04-schema.md`, except `plugin_kv` which comes in Phase 3)
- Implement `Database` wrapper class with: `insertSession`, `insertChunk`, `searchChunks`, `deleteChunks`, etc.
- Unit tests for each method

**Validation**: All storage unit tests pass

#### 2.3 Capture pipeline

- Implement transcript JSONL parser (Claude Code's transcript format)
- Implement rule-based chunker (one chunk per turn, with metadata extraction)
- Implement the capture pipeline: `parseTranscript → chunkify → store`
- Unit tests with sample transcripts

**Validation**: Given a sample transcript, chunks are correctly stored

#### 2.4 Search pipeline

- Implement FTS5 search wrapper (with CJK n-gram pre-processing for Japanese)
- Implement BM25 + time decay ranking
- Implement keyword-based reranker
- Unit tests for various query patterns including Japanese

**Validation**: Search returns relevant results for both English and Japanese queries

#### 2.5 Inject pipeline

- Implement context formatting (Markdown, with budget control)
- Implement the inject pipeline: `search → format → output`
- Unit tests for formatting edge cases

**Validation**: Output respects token budget

#### 2.6 Maintenance

- Implement the maintenance operations from `04-schema.md`
- Implement the 24-hour throttle
- Unit tests with mocked timestamps

**Validation**: Maintenance runs only when due

#### 2.7 CLI package

- Create `packages/kizuna-cli/` with package.json, bin entry
- Implement `kizuna setup` (configures Claude Code hooks for the current project)
- Implement `kizuna search <query>` (calls search pipeline)
- Implement `kizuna list [--session <id>]` (lists chunks)
- Implement `kizuna stats` (database statistics)
- Implement `kizuna prune --older-than <days>` (manual cleanup)
- Integration tests using a temporary database

**Validation**: All CLI commands work end-to-end against a real SQLite file

#### 2.8 Hook handlers

- Implement the SessionEnd hook handler (runs the capture pipeline)
- Implement the UserPromptSubmit hook handler (runs the search and inject pipelines)
- Implement the SessionStart hook handler (injects baseline context)
- The handlers are CLI subcommands invoked by `kizuna setup`'s registered hooks
- End-to-end tests with mock Claude Code transcripts

**Validation**: Hooks complete within latency budgets and produce expected output

### Exit Criteria

- Running `kizuna setup` configures Claude Code hooks for a project
- Running a Claude Code session and exiting saves chunks to SQLite
- A subsequent session injects relevant memories into prompts
- All unit and integration tests pass
- `pnpm tsc --noEmit` passes
- The project owner has used the tool in their own daily work for at least one week without major issues

### Out of Scope (Phase 2)

- Plugin system (Phase 3)
- MCP server (Phase 3)
- Cross-repository sharing (Phase 3 plugin)
- OpenAPI/contract awareness (separate, project-specific plugin)
- Hybrid search with embeddings (Phase 5)
- Web UI (Phase 5)

---

## Phase 3: Plugin System

**Status: Pending**

### Goal

Add the plugin system so that project-specific or use-case-specific functionality can be added without modifying the core. Validate the plugin API by implementing one plugin.

### Entry Conditions

- Phase 2 complete and used in real workflow for at least a week
- No major design issues identified during Phase 2 usage

### Deliverables

#### 3.1 Plugin loader

- Implement `PluginManager` class in `kizuna-core/src/plugin/`
- Implement plugin discovery (config-declared and auto-discovered)
- Implement plugin lifecycle (init, shutdown)
- Implement migration runner for plugin migrations
- Implement per-plugin KV storage (`plugin_kv` table from schema doc)
- Unit tests with mock plugins

#### 3.2 Pipeline integration

- Refactor capture pipeline to invoke `beforeCapture` and `afterCapture` hooks
- Refactor search pipeline to invoke `beforeSearch` and `afterSearch` hooks
- Refactor inject pipeline to invoke `enrichContext` hooks
- Ensure error isolation: a failing plugin does not break the pipeline
- Tests verifying hook execution order and error handling

#### 3.3 Plugin: pii-sanitizer

- Create `packages/plugin-pii-sanitizer/` (the example from `05-plugin-api.md`)
- Implement and test
- Document its configuration

**Validation**: With the plugin enabled, API keys in transcripts are redacted before storage

#### 3.4 MCP server

- Create `packages/kizuna-mcp/` with package.json, bin entry
- Implement MCP stdio transport using the official SDK
- Implement core MCP tools: `kizuna_search`, `kizuna_save`, `kizuna_list`, `kizuna_delete`
- Integrate plugin-provided MCP tools
- Documentation on registering with Claude Code

**Validation**: Claude Code can invoke `kizuna_search` and receive results

#### 3.5 Plugin: multi-repo-sharing

- Create `packages/plugin-multi-repo-sharing/` (the example from `05-plugin-api.md`)
- Implement and test
- Document configuration for shared storage

**Validation**: Two projects pointing to a shared database can see each other's tagged memories

### Exit Criteria

- Plugin API is stable and documented
- Two example plugins work end-to-end
- MCP server provides bidirectional search to active Claude Code sessions
- All tests pass
- The project owner has used a plugin-enabled setup in real workflow

---

## Phase 4: Public Release Preparation

**Status: Pending**

### Goal

Make the repository ready for public release. Polish documentation, add CI, address anything that would embarrass a public OSS author.

### Entry Conditions

- Phase 3 complete and stable
- Project owner is satisfied with the tool's daily usability

### Deliverables

#### 4.1 Documentation polish

- Comprehensive README.md with usage examples
- CONTRIBUTING.md (clearly stating no support guarantee)
- SECURITY.md
- Per-package READMEs
- Migration guide from Engram (optional, if it makes sense)

#### 4.2 CI/CD

- GitHub Actions workflow for: lint, type check, test on Node.js v22 and v24
- No publish automation (manual control)
- Status badges in README

#### 4.3 Code quality

- ESLint configuration
- Prettier configuration
- Pre-commit hooks (optional: husky + lint-staged)

#### 4.4 Release artifacts

- Per-package version bump (probably v0.1.0 for initial public release)
- Changelog (CHANGELOG.md per package)
- npm publish dry run (do not actually publish until ready)

#### 4.5 Visibility

- Repository made public
- (Optional) Announcement post on Zenn or DEV.to
- (Optional) Listing in awesome-claude-code or similar

### Exit Criteria

- Repository is public on GitHub
- A new user can read the README and have Kizuna working in 5 minutes
- CI passes on every PR
- Project owner has shared the tool externally (or made the conscious decision not to)

---

## Phase 5: Extensions and Ecosystem

**Status: Future**

### Goal

Open-ended phase for ongoing improvements based on actual usage. Specific work depends on what becomes important.

### Possible Directions

- **Hybrid search plugin**: FTS5 + sqlite-vec with a small embedding model (Ruri v3-30m or similar)
- **Web UI plugin**: Browser-based memory viewer
- **Project-specific plugins**: Such as the OpenAPI/contract plugin (likely in a separate, internal repository)
- **Performance optimization**: If usage patterns reveal bottlenecks
- **Plugin ecosystem support**: Documentation for third-party plugin authors, plugin discovery mechanism
- **Additional hook types**: As Claude Code introduces new hooks
- **Cross-language plugins**: Allowing Python or Rust plugins via a wrapper protocol

### No Fixed Timeline

Phase 5 work is opportunistic. Items get pulled in as they become valuable, not on a predetermined schedule.

---

## Working with Claude Code CLI on This Roadmap

When using Claude Code CLI to make progress on this roadmap, follow this pattern:

### Starting work on a phase

```
We are starting Phase X.Y. Before any code changes:
1. Read docs/01-vision.md, docs/02-design-principles.md, docs/03-architecture.md
2. Read docs/0N-* corresponding to this phase's deliverables
3. Read all docs/adr/ files
4. Summarize back what you understand the goal of Phase X.Y to be
5. Wait for confirmation before proceeding
```

### During implementation

- Work on one deliverable at a time
- After each deliverable: run tests and tsc, then summarize what changed
- Wait for review before moving to the next deliverable
- Suggest commit messages but do not commit (the project owner commits manually)

### When unsure

- Re-read relevant ADRs before making design choices
- If no ADR covers the situation, ask the project owner before deciding
- Default to the more conservative option that preserves the design principles

### Forbidden during implementation

- Do not skip ahead to later phases ("while I'm at it...")
- Do not refactor code that is not part of the current task
- Do not add dependencies without explicit approval
- Do not make commits or push (project owner does this manually)

---

## Phase Transitions

A phase transition requires:

1. All deliverables in the current phase are complete
2. All exit criteria are met
3. The project owner explicitly declares the phase complete
4. The roadmap document is updated (status fields, lessons learned)

Skipping phases is not allowed. If a later phase deliverable seems urgently needed, it indicates the current phase's scope was wrong; revise the roadmap rather than skipping.
