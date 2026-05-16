# 0014. CLI plugin config command for structured options

**Status**: Proposed

**Date**: 2026-05-16

## Context

The `multi-repo-sharing` plugin requires structured configuration — specifically, a `references` array of `{ name, dbPath }` objects — but the CLI provides no way to manage this. The current `kizuna plugin enable multi-repo-sharing --namespace <name>` command accepts the argument and writes it to `plugins.json`, but the plugin's federated search implementation (ADR-0013, Accepted) ignores the `namespace` field entirely. Users must manually edit `.kizuna/plugins.json` to configure `references`.

### Problems with the current state

1. **Misleading CLI option**: `--namespace` suggests the plugin uses namespaces, but the actual mechanism is path-based federated search. Users who run the documented command get a non-functional configuration.

2. **No CLI support for structured data**: The `enable` command's option model (simple key-value flags) cannot express an array of objects. Attempting to bolt this onto `enable` (e.g., `--reference name:path` repeated) conflates two distinct responsibilities: toggling a plugin on/off and managing its configuration.

3. **Manual editing is error-prone**: JSON syntax errors in `plugins.json` silently disable plugin loading (the loader returns `null` on parse failure — see `kizuna-core/src/plugin/loader.ts:51-61`).

### Design constraints

- The existing `kizuna plugin` subcommands (`enable`, `disable`, `list`, `status`) form a coherent set for plugin lifecycle management. Adding configuration concerns to `enable` would overload its purpose.
- Other plugins may also benefit from CLI-managed structured options in the future (e.g., `openapi-awareness` with its `specPaths` array).
- The CLI targets developers who are comfortable with git-style compound commands.

## Decision

Introduce a new `kizuna plugin config <plugin-name> <subcommand>` command hierarchy that manages plugin options separately from the enable/disable lifecycle.

### Command structure

```
kizuna plugin config <plugin-name> add-reference <name> <path>
kizuna plugin config <plugin-name> remove-reference <name>
kizuna plugin config <plugin-name> list-references
kizuna plugin config <plugin-name> set <key> <value>
```

### Design choices

1. **Separation of concerns**: `enable`/`disable` toggle the `enabled` flag only, without touching the `options` object. `config` manages the `options` object without affecting the `enabled` state.

2. **Positional arguments over flags**: `add-reference <name> <path>` uses positional arguments rather than `--name`/`--path` flags or `name:path` delimiters. This avoids Windows path conflicts with `:`, aligns with the `git remote add <name> <url>` pattern, and works well with shell path completion on the second argument.

3. **Differential operations**: `add-reference` appends to the existing array; `remove-reference` removes by name. This avoids requiring users to re-specify all references on every change (unlike the "full overwrite" alternative).

4. **Generic `set` for scalar options**: Simple key-value options like `halfLifeDays` use a generic `set <key> <value>` subcommand rather than per-option flags, keeping the command surface minimal and extensible.

5. **Path validation as warning**: When `add-reference` is called with a path that does not exist, emit a warning but proceed. This accommodates setup scripts that configure references before the target project's database is created.

6. **Deprecation over removal for `--namespace`**: The `--namespace` option on `enable` will emit a deprecation warning directing users to `plugin config ... add-reference`. It remains functional (writes to `options.namespace`) until a major version bump, at which point it is removed.

## Rationale

### Alternative 1: Extend `enable` with `--reference` flag

```
kizuna plugin enable multi-repo-sharing --reference backend-api:/path/to/db
```

Rejected because:

- Overloads `enable` with configuration management (violates single responsibility)
- Requires full re-specification of all references on every `enable` call (or introduces `enable --add-reference` which is semantically confusing — you're not "enabling" anything)
- The colon delimiter conflicts with Windows drive letters (`C:\...`)
- Cannot express removal or listing without further flag proliferation

### Alternative 2: Interactive configuration wizard

A `kizuna plugin setup multi-repo-sharing` that prompts for references interactively. Rejected because:

- Kizuna hooks run non-interactively (stdin is consumed by hook input)
- Scripting and automation become difficult
- Inconsistent with the rest of the CLI's non-interactive design

### Alternative 3: Direct `plugins.json` editing with `kizuna plugin edit`

Open `plugins.json` in `$EDITOR`. Rejected because:

- Doesn't reduce the error surface (users still write raw JSON)
- No validation feedback
- Not scriptable

### Why `git remote`-style commands

The `git remote add/remove/show` pattern is well-established among the target audience (developers using CLI tools daily). It provides:

- Predictable command discovery (`config --help` lists subcommands)
- Composability in scripts (`kizuna plugin config multi-repo-sharing add-reference ...`)
- Natural mapping to CRUD operations on a named collection

## Consequences

### Positive

- Users can configure `multi-repo-sharing` without editing JSON manually
- The `enable` command remains simple (toggle on/off)
- The pattern generalizes to other plugins with structured options
- Scriptable for multi-repo setup automation
- Path validation catches typos early (as warnings)

### Negative

- Deeper command nesting (`kizuna plugin config <plugin> <subcommand> <args>`) — mitigated by the target audience being CLI-literate developers
- Two places to look for plugin state: `enable`/`disable` for lifecycle, `config` for options — mitigated by `plugin status` showing both
- The generic `set` command accepts arbitrary keys without schema validation; invalid keys are silently stored (same as manual JSON editing)

### Implementation phases

1. **Phase 1**: Deprecate `--namespace` with warning; create `config` command skeleton with `list-references` (read-only, safe to ship first)
2. **Phase 2**: Implement `add-reference`, `remove-reference`, `set`; add path validation
3. **Phase 3**: Remove `--namespace` at next major version; update documentation
