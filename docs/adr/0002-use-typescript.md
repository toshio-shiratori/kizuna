# 0002. Use TypeScript as the implementation language

**Status**: Accepted

**Date**: 2026-05-02

## Context

Kizuna needs an implementation language. The choice affects:

- Distribution mechanism (npm vs. binary, etc.)
- Available libraries (especially for SQLite, MCP, and CLI)
- Plugin authoring experience (plugins are written in the same language)
- Development velocity for the project owner
- Compatibility with the surrounding Claude Code ecosystem

The relevant constraints are:

- Must integrate with Claude Code, which itself runs in Node.js (or its native binary derivative)
- Must support the MCP TypeScript SDK
- Must run efficiently as short-lived hook handlers (process startup time matters)
- Must support cross-platform development (macOS, Linux, Windows)
- The plugin system requires authors to write code; that code's language matters for adoption

Alternatives considered:

1. **TypeScript** (Node.js runtime)
2. **Rust** (single binary distribution)
3. **Go** (single binary distribution)
4. **Python** (familiar to many AI/ML users)
5. **JavaScript** (TypeScript without the type system)

## Decision

Use TypeScript with the Node.js runtime. Use ESM modules with `"type": "module"`. Enable strict mode.

Distribution is via npm packages within a pnpm monorepo.

## Rationale

### Why TypeScript

- **Engram precedent**: Engram is written in TypeScript and demonstrated this is a viable choice for Claude Code memory tools. Many design lessons from Engram translate directly.
- **MCP SDK is TypeScript-first**: The Model Context Protocol's primary SDK is TypeScript. Using a different language would require a less-mature SDK or implementing the protocol from scratch.
- **Plugin authoring**: TypeScript is one of the most accessible languages for plugin authors. Many web developers can contribute plugins without learning a new language.
- **better-sqlite3 ergonomics**: The synchronous API of `better-sqlite3` is well-suited to the short-lived hook handler pattern. Async pollution is avoided.
- **Type safety for plugin API**: A well-typed plugin interface catches errors at development time. Plugin authors get IDE autocomplete and inline documentation.
- **Tooling ecosystem**: pnpm, vitest, tsconfig, and editor support are excellent.
- **Project owner familiarity**: Faster development velocity than learning a new language.

### Why not Rust

- Single-binary distribution is appealing, but the MCP ecosystem has limited Rust support
- Plugin authoring in Rust raises the barrier to contribution significantly
- SQLite bindings exist but the ergonomics are heavier than `better-sqlite3`
- Compilation times slow down iteration during development
- The project owner would need to learn Rust to maintain it long-term

### Why not Go

- Similar single-binary advantage to Rust, similar drawbacks
- Go's plugin system is awkward (compiled .so files, version brittleness)
- Less common in the Claude Code ecosystem; fewer reference implementations to learn from
- The project owner has less Go experience

### Why not Python

- Python startup time is slower, which matters for hook handlers (target < 100ms)
- The MCP SDK exists for Python but TypeScript is more mature
- SQLite support is excellent in Python but the GIL makes concurrent scenarios harder
- Plugin authoring in Python is fine, but TypeScript is more aligned with the Claude Code ecosystem

### Why not plain JavaScript

- TypeScript adds compile-time safety with minimal runtime cost
- The plugin API benefits enormously from explicit type definitions
- No real downsides for this project size

## Consequences

### Positive

- Type-safe plugin API with IDE support
- Direct interoperability with the MCP TypeScript SDK
- Familiar npm-based distribution
- Easy onboarding for plugin authors familiar with the JavaScript ecosystem
- Engram and similar projects can be referenced for design patterns
- pnpm monorepo support is mature

### Negative

- Native binary requires Node.js runtime (mitigated by mise pinning the version)
- Hook handler startup time is slower than Rust/Go (~50-100ms for Node.js vs. ~5ms for Go)
- npm dependency tree management is non-trivial; we mitigate with strict dependency rules
- Type complexity can spiral; we mitigate with strict mode and code review

### Constraints introduced

- All packages use ESM (`"type": "module"`); no CommonJS
- Strict mode is enabled across all packages
- Named exports only (no default exports) for better refactor support
- Node.js v24 LTS minimum, pinned via `mise.toml`

## Implementation Notes

The base `tsconfig.base.json` is shared across packages and configured for:

- Target: ES2022 (matches Node.js v24 capabilities)
- Module: ESNext with bundler resolution
- Strict mode: all checks enabled, including `noUncheckedIndexedAccess`
- `verbatimModuleSyntax`: true (forces explicit `import type` for type-only imports)
- `isolatedModules`: true (compatible with Vitest's transformer)

Code style and linting will be added in Phase 4 (ESLint + Prettier). For Phases 1-3, TypeScript's compiler is the primary correctness check.

## Future Reconsideration

If the project ever needs to support extremely low-latency hook handlers (< 10ms target) or distribute as a single binary for users who do not have Node.js, consider:

- A Rust rewrite of the core (with TypeScript plugins via WASM)
- Or a pre-compiled binary using Node.js Single Executable Applications

These are not on the current roadmap.
