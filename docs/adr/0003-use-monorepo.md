# 0003. Use pnpm workspaces monorepo structure

**Status**: Accepted

**Date**: 2026-05-02

## Context

Kizuna will consist of multiple packages: a core library, a CLI, an MCP server, and one or more plugins. The repository structure decision affects:

- How packages share code and types
- Release coordination
- Development experience (local builds, tests)
- Plugin ecosystem (whether plugins live in this repo or separate repos)
- CI complexity

The relevant constraints are:

- Plugins use the core's types; tight coupling at the type level
- The core, CLI, and MCP server share constants and utilities
- Some plugins may live in this repository (official plugins), others may be external (third-party plugins)
- The project owner is the sole maintainer; complexity must be manageable

Alternatives considered:

1. **Monorepo with pnpm workspaces**
2. **Monorepo with a different tool** (Turborepo, Nx, Lerna)
3. **Multiple separate repositories**, one per package
4. **Single package** containing all functionality

## Decision

Use a pnpm workspaces monorepo. The structure is:

```
kizuna/
├── packages/
│   ├── kizuna-core/
│   ├── kizuna-cli/
│   ├── kizuna-mcp/
│   ├── plugin-pii-sanitizer/
│   └── plugin-multi-repo-sharing/
├── docs/
└── (config files)
```

Project-specific or organization-specific plugins (the OpenAPI/contract plugin in particular) will live in **separate repositories**, not in this monorepo.

## Rationale

### Why a monorepo

- **Tight type coupling**: The plugin API types in `kizuna-core` are imported by every other package. A monorepo allows TypeScript to follow type definitions across packages during development without publishing intermediate versions.
- **Atomic changes**: Changes that affect multiple packages (e.g., adding a new hook to the plugin API + updating an example plugin) can be made in a single commit and PR.
- **Shared tooling**: One tsconfig.base.json, one vitest config style, one CI configuration.
- **Easier local development**: `pnpm install` once, all packages link via workspace protocol.

### Why pnpm workspaces (not Turborepo/Nx)

- **Simpler**: pnpm workspaces do not require additional configuration files (turbo.json, nx.json)
- **Sufficient**: The build orchestration needs are modest (tsc, test); pnpm's `--recursive` flag covers them
- **Less lock-in**: pnpm workspaces is a thin layer; switching off it later is easy
- **Already chosen as package manager**: pnpm is the package manager (Phase 0 decision); using its native workspace support adds no new tools

Turborepo and Nx are excellent tools, but their value increases with build graph complexity. Kizuna's build graph is shallow.

### Why not separate repositories

- Plugin development would require publishing core to npm before plugins could compile against it; iteration cycles would slow significantly
- Coordinating breaking changes across the plugin API would require careful version juggling across repositories
- For the project's solo-maintainer reality, the overhead of managing multiple repositories outweighs the benefits

### Why some plugins still live in separate repositories

Project-specific plugins (the OpenAPI/contract plugin developed for the project owner's workplace) deliberately live outside this repository because:

- They contain domain-specific logic that doesn't belong in a generic OSS tool
- They may be developed in different release cadences
- They may have different licensing or visibility requirements
- They reinforce the architectural boundary between "generic Kizuna" and "specific use cases"

This separation is also legally meaningful: it makes it clear that the public Kizuna is a generic tool with no business-specific context.

### Why not a single package

- The CLI, MCP server, and plugins have different runtime characteristics (CLI binary, MCP server stdio process, library)
- Plugins need to declare `kizuna-core` as a peer dependency, which requires it to be a separate package
- A single package would mix unrelated dependencies (commander for CLI, MCP SDK for server) bloating the install footprint

## Consequences

### Positive

- Fast local development with workspace protocol (`workspace:*`)
- Easy to add new packages (especially plugins)
- Shared tsconfig and vitest configuration
- Single CI workflow can build and test everything
- Atomic commits across packages

### Negative

- Slightly more complex than a single package for newcomers
- Requires understanding of pnpm workspaces (mitigated by README documentation)
- Per-package versioning requires care (each package has its own version)
- Publishing involves multiple `npm publish` calls (or a release script in Phase 4)

### Constraints introduced

- Each package must have its own `package.json` and `tsconfig.json`
- Inter-package imports use the package name (e.g., `import { foo } from '@kizuna/core'`), not relative paths
- The workspace protocol (`"@kizuna/core": "workspace:*"`) is used for local development; this is rewritten on publish
- Plugins NOT in this repository declare a regular semver range for `@kizuna/core` as a peer dependency

## Implementation Notes

`pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
```

Each package has:

- `package.json` with `"name": "@kizuna/<name>"` (or `"name": "kizuna-<name>"` for non-scoped names)
- `tsconfig.json` extending `../../tsconfig.base.json`
- `src/` and (for testable packages) `tests/` or colocated `*.test.ts` files
- Per-package `README.md`

The naming convention for packages:

- Core packages: `@kizuna/core`, `@kizuna/cli`, `@kizuna/mcp`
- Official plugins: `@kizuna/plugin-<name>`
- Third-party plugins (any namespace): `@your-org/kizuna-plugin-<name>` is suggested but not enforced

## Publishing Strategy (Phase 4)

To be detailed when Phase 4 is reached. Tentative plan:

- Use `pnpm publish -r` for recursive publishing
- Manually bump versions per package (or use `changesets` if it proves needed)
- Public release starts at v0.1.0 across all packages
- Breaking changes during pre-1.0 are signaled by minor version bumps with changelog notes
