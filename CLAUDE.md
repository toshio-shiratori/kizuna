# Kizuna - Project Instructions for Claude Code

## Project Overview

Kizuna is a plugin-based local long-term memory MCP server for Claude Code,
designed for cross-repository agent collaboration. It is a personal
open-source project published under the MIT license.

This project is inspired by:

- Engram (https://github.com/okamyuji/engram)
- sui-memory (https://github.com/noprogllama/sui-memory)

Maintenance is on a best-effort basis only. No SLA or support guarantee.

## Core Design Principles

These principles are inherited from sui-memory and Engram. Adhere to
them strictly. Any deviation must be explicitly justified and confirmed.

1. **No external dependencies** - SQLite single file. No external APIs
   or large model downloads in the core.
2. **Zero token cost on save** - Use rule-based chunking. Do NOT use
   LLM for summarization in core.
3. **Auto save** - Via SessionEnd hook, no manual operations.
4. **Always recall** - Via UserPromptSubmit hook, automatic injection
   of relevant memories.
5. **Edit and delete** - CLI for searching, editing, deleting memories.
6. **Minimal dependencies** - Core depends only on better-sqlite3.
7. **DB bloat prevention** - Auto-maintenance on session save (every 24h).

## Architecture

- Monorepo with pnpm workspaces
- TypeScript (strict mode, ESM modules)
- Core: `packages/kizuna-core` - depends only on better-sqlite3
- MCP Server: `packages/kizuna-mcp` - depends on core + MCP SDK
- CLI: `packages/kizuna-cli` - depends on core + commander
- Plugins: `packages/plugin-*` - implement plugin API from core

## Development Workflow

### Phase-Based Development

Development proceeds in phases. Do NOT implement features beyond the
current phase. Stick to what's specified in the current task.

- Phase 1: Design documents (architecture.md, schema.md, plugin-api.md)
- Phase 2: Core implementation (storage, search, hooks)
- Phase 3: Plugin system
- Phase 4: Public release preparation
- Phase 5: Extensions (multi-repo, hybrid mode, etc.)

### Working Rules

- Confirm before installing new dependencies
- Confirm before creating new files outside the planned structure
- Do NOT add complex abstractions speculatively (YAGNI applies strictly)
- Do NOT refactor existing code without being asked
- Do NOT delete files without explicit confirmation
- Always run `pnpm tsc --noEmit` and `pnpm test` before declaring work complete
- Always run `pnpm lint` and `pnpm format:check` before declaring work complete

### Commits and Branches

- The user (project owner) handles all `git commit` and `git push` operations
- Do NOT commit or push automatically
- Suggest commit messages in Conventional Commits format when work is complete:
  - `feat:` new feature
  - `fix:` bug fix
  - `docs:` documentation
  - `refactor:` code restructuring without behavior change
  - `test:` test additions or modifications
  - `chore:` maintenance tasks
- Work on feature branches when implementing new features

## Key Commands

| Command             | Description             |
| ------------------- | ----------------------- |
| `pnpm build`        | Build all packages      |
| `pnpm test`         | Build + run all tests   |
| `pnpm tsc`          | Type check all packages |
| `pnpm lint`         | ESLint                  |
| `pnpm format`       | Prettier (auto-fix)     |
| `pnpm format:check` | Prettier (check only)   |

## Coding Style

- TypeScript strict mode enabled
- ESM modules (`"type": "module"` in package.json)
- Named exports only (no default exports)
- Async/await preferred over promise chains
- Error handling: never swallow errors silently
- Formatting: Prettier (config in `.prettierrc.json`)
- Linting: ESLint with typescript-eslint (config in `eslint.config.js`)
- Tests: vitest, colocated as `*.test.ts`

## Privacy and Safety

- **Never include real API keys, secrets, or PII** in code, tests,
  comments, commit messages, or documentation.
- **Sanitize examples**: Use placeholder values like `sk-ant-EXAMPLE`
  or `your-api-key-here`.
- **No business-specific context**: This is a generic open-source tool.
  Do not reference any specific company, project, internal system,
  or proprietary information in any file.
- **Cross-repo collaboration is the use case**, not any specific business
  scenario. Keep all examples and documentation generic.

## What NOT to do

- **NEVER commit with warnings or errors.** All checks (`pnpm tsc --noEmit`,
  `pnpm test`, `pnpm lint`, `pnpm format:check`) must pass with
  0 warnings and 0 errors before committing. Fix pre-existing violations
  in a separate commit if needed.
- Do not generate marketing copy, taglines, or vision statements
  unless explicitly asked.
- Do not refactor existing code without being asked.
- Do not delete files without explicit confirmation.
- Do not add new packages or dependencies without explicit confirmation.
- Do not write business-specific or company-specific code.
- Do not auto-commit or auto-push to git.

## Agent Usage

This project has three custom agents in `.claude/agents/`:

- **kizuna-implementer**: For implementing features from Issues
- **kizuna-reviewer**: For reviewing implementations
- **kizuna-test-writer**: For writing tests

When working on an Issue, the typical flow is:

1. Use `kizuna-implementer` to implement the feature
2. Use `kizuna-test-writer` to add tests (if not already written)
3. Use `kizuna-reviewer` to review the implementation before PR creation

Each agent reads relevant docs before starting. Trust their pre-flight
reading and validation.

## Issue/PR Workflow

All work is done in Issue/PR pairs:

1. Issue describes the work (created by user or via templates)
2. Branch named `feat/issue-N-description`, `fix/issue-N-description`, etc.
3. Commits include `(#N)` referencing the Issue
4. PR uses the PULL_REQUEST_TEMPLATE.md
5. PR includes `Closes #N` to auto-close the Issue on merge
6. User reviews and merges; agents do not merge

For Issue creation, use `gh issue create` with the appropriate template.

### Implementation Checklist (MANDATORY)

Phase タスクの実装を開始する際、以下の順序を厳守すること。
ステップを飛ばして実装に着手してはならない。

1. **Issue 作成** — `gh issue create` (テンプレート: phase-task)
2. **ブランチ作成** — `feat/issue-N-description` を main から切る
3. **実装** — コーディングとテスト
4. **検証** — `pnpm tsc --noEmit && pnpm test && pnpm lint && pnpm format:check`
5. **コミット** — Conventional Commits + `(#N)` 参照
6. **PR 作成** — `Closes #N` を含める

「実装を開始して」「作業開始」等の指示を受けた場合、
Issue が未作成であれば **まず Issue 作成を行い確認を取る**。

## Kizuna (Long-term Memory)

Memories are captured and recalled automatically via hooks. For active queries:

| Command                              | Description                         |
| ------------------------------------ | ----------------------------------- |
| `kizuna search <query>`              | Search this project's memories      |
| `kizuna search <query> --cwd <path>` | Search another project's memories   |
| `kizuna list --session <id>`         | List chunks from a specific session |
| `kizuna stats`                       | Show database statistics            |
