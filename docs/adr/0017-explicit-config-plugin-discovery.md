# 0017. Explicit-config-only plugin discovery

**Status**: Accepted

**Date**: 2026-06-07

## Context

ADR-0005 (Adopt a plugin architecture) left plugin discovery deliberately
open: plugins were to be "discovered via configuration (`.kizuna/config.json`)
and/or naming convention (`@kizuna/plugin-*`, `kizuna-plugin-*`)". Its Future
Considerations also floated "plugin discovery via npm registry search" as a
possible Phase 5 addition.

In practice, only one of these was ever implemented. The Phase 3 plugin loader
(`packages/kizuna-core/src/plugin/loader.ts`) resolves plugins **exclusively**
from explicit declarations in `.kizuna/plugins.json`:

```jsonc
// .kizuna/plugins.json
{
  "plugins": {
    "@kizuna/plugin-pii-sanitizer": { "enabled": true, "options": {} },
  },
}
```

`loadPluginManager()` reads this file, filters to entries with `enabled: true`,
and imports each named package (first from the CLI's `node_modules`, then from
the project's `node_modules`). There is **no** scanning of `node_modules` for
packages matching a naming convention, and no npm registry lookup.

Two problems followed from the gap between the documentation and the code:

1. The plugin API spec (`docs/05-plugin-api.md`) claimed auto-discovery existed
   ("Installed npm packages whose names match `@kizuna/plugin-*` ... are
   auto-discovered"). A third-party author following that doc would expect a
   plugin to load merely by installing it, which never worked.
2. The Phase 5 plugin-ecosystem investigation (Issue #259) must decide whether
   to close the gap by _building_ convention-based discovery, or to _ratify_
   explicit-config-only as the intended design.

This ADR records that decision.

Note: this is unrelated to the `multi-repo-sharing` plugin's `autoDiscover`
option, which discovers sibling **databases** to search (ADR-0013), not
Kizuna plugins to load. That feature is unaffected.

## Decision

Explicit configuration in `.kizuna/plugins.json` is the **only** supported
plugin discovery mechanism. Convention-based auto-discovery (scanning
`node_modules` for `@kizuna/plugin-*` / `kizuna-plugin-*`) and npm-registry
search are **not** implemented and will **not** be added.

Plugins are declared explicitly, managed through the existing
`kizuna plugin enable|disable|config` commands (ADR-0014), and loaded only when
present and `enabled: true`.

This decision clarifies the open "and/or naming convention" clause of ADR-0005
and withdraws its "plugin discovery via npm registry search" future
consideration.

## Rationale

### Explicit over implicit (Principle 1, Principle 2)

Auto-loading any installed package whose name matches a pattern means a
transitive dependency could silently inject a plugin into the capture and
search pipelines — code that reads and rewrites the user's memory and runs on
every session hook. Explicit declaration keeps the user in control of exactly
what executes, with no surprise activation. This matches the project's broader
preference for explicit, auditable behavior over magic.

### Minimal dependencies and surface (Principle 6)

Convention scanning requires walking `node_modules` (including hoisted and
nested trees across pnpm/npm/yarn layouts); registry search requires a network
client and an availability/error story. Both add machinery and failure modes to
the core for a capability the explicit path already covers. Keeping discovery to
a single JSON read preserves the "single SQLite file + better-sqlite3" core
profile.

### YAGNI — no demonstrated demand

All five existing plugins, and the documented third-party workflow
(`docs/08-plugin-development.md`), work fine with explicit declaration plus
`kizuna plugin enable`. No user has asked to drop the declaration step. Building
discovery now would be speculative complexity (a recurring failure mode called
out in the roadmap).

### The convenience gain is small

The only thing auto-discovery saves is a single `kizuna plugin enable <name>`
after `pnpm add <name>` — a one-time, explicit, scriptable step. That is not
worth the control and complexity costs above.

## Consequences

### Positive

- The documentation can now describe one true, simple discovery path.
- No surprise plugin activation from transitive dependencies.
- Core stays free of `node_modules` traversal and registry-client code.
- Plugin lifecycle remains fully managed by the `kizuna plugin` CLI (ADR-0014).

### Negative

- Installing a plugin is two steps (`pnpm add`, then `kizuna plugin enable`)
  rather than one. Mitigated by the CLI commands and the fact that the enable
  step is scriptable.
- ADR-0005's text still mentions naming-convention discovery; its status is
  updated to point here, but the body is left intact per the ADR immutability
  rule.

### Re-open conditions

Revisit if a concrete need emerges — for example, a plugin marketplace or a
large enough plugin ecosystem that manual enabling becomes a real friction
point. At that time, prefer an **opt-in** discovery mode (e.g., a
`"discover": true` flag in `.kizuna/plugins.json`) over implicit
always-on scanning, so the explicit-by-default guarantee is preserved.
