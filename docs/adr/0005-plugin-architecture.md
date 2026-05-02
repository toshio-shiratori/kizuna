# 0005. Adopt a plugin architecture for extensibility

**Status**: Accepted

**Date**: 2026-05-02

## Context

Kizuna aims to be useful across diverse projects with different characteristics. The needs vary widely:

- A pure individual development project may want only basic memory
- A team project may want PII redaction before storage
- A multi-repository setup may want shared namespaces
- A specific business context may want domain-aware features (e.g., OpenAPI contract awareness)

If all these features are built into the core, the core becomes:

- Bloated with unrelated functionality
- Subject to feature creep that conflicts with the design principles
- Harder to maintain
- Less likely to remain a clean, focused tool

If features are added only as core changes, the core has to either:

- Include all features for everyone (bloat)
- Include none of the specific features (limited utility)

A third option is to extract specialization into plugins, leaving the core focused.

There is also a strategic concern. The project owner is developing Kizuna to address a specific workplace coordination problem (FE/BE team alignment via shared memory). However, the public OSS version must remain generic to:

- Be useful to a broad audience
- Avoid embedding workplace-specific context
- Maintain a clear separation between "the generic tool" and "specific use cases" for legal and licensing clarity

A plugin architecture allows the generic core to be public OSS while specific extensions remain in separate (potentially private) repositories.

Alternatives considered:

1. **Plugin architecture** with hook points and a registry
2. **Configuration-only** approach (everything is a flag in the core)
3. **Fork-based** customization (users fork and modify)
4. **Core + opinionated extensions** (extensions live in the same repo but are optional features)

## Decision

Adopt a plugin architecture. Plugins are npm packages that:

- Implement a defined `Plugin` interface
- Are discovered via configuration (`.kizuna/config.json`) and/or naming convention (`@kizuna/plugin-*`, `kizuna-plugin-*`)
- Hook into well-defined points in the capture, search, and inject pipelines
- Can add custom MCP tools, CLI commands, and database tables

The plugin API is defined in `docs/05-plugin-api.md`.

## Rationale

### Why plugins (not configuration-only)

- Configuration flags can express simple variations (enable/disable PII redaction) but not complex logic (custom regex patterns, custom matching rules, integration with external systems)
- A plugin can have its own dependencies; a config flag in the core would force the core to depend on every potential extension's libraries
- Plugins can be independently versioned and released
- Third parties can develop plugins without coordinating with the core

### Why plugins (not fork-based customization)

- Forking is a heavy-weight commitment that loses easy upstream updates
- Most users want incremental customization, not a divergent fork
- Forks fragment the ecosystem; plugins create a shared ecosystem with diverse extensions

### Why plugins (not core + opinionated extensions in same repo)

- Some plugins (project-specific OpenAPI plugin) shouldn't be in the public repo for legal clarity
- Plugins have different release cadences than the core
- Mixing optional features with the core blurs the architectural boundary

### Why this specific plugin API design

The plugin API has hook points at each pipeline stage (`beforeCapture`, `afterCapture`, `beforeSearch`, `afterSearch`, `enrichContext`). This design has these advantages:

- **Composability**: Multiple plugins can transform the same chunk, query, or result chain
- **Predictability**: Hook execution order is configuration-defined; behavior is reproducible
- **Isolation**: Each plugin has its own KV namespace and metadata namespace
- **Testability**: Each hook can be unit-tested in isolation

The API uses object methods (not function exports) to support:

- Plugin metadata (`name`, `version`, `description`)
- Multiple hooks per plugin
- Lifecycle hooks (`init`, `shutdown`)
- Future extensibility (new optional methods can be added without breaking existing plugins)

### What stays in the core vs. moves to plugins

**In core (always present)**:

- Storage layer
- Capture pipeline (rule-based chunking)
- Search pipeline (FTS5 + BM25 + time decay)
- Inject pipeline (formatting and budget control)
- Maintenance
- Plugin manager
- Basic CLI commands (search, list, prune, stats, setup)
- MCP tools that are universally useful (search, save, list)

**In plugins (optional)**:

- PII/secret redaction
- Multi-repository sharing namespace logic
- Domain-specific entity extraction (OpenAPI contracts, code symbols, etc.)
- Custom chunking strategies
- Integration with external systems (Slack notifications, Sentry, etc.)
- LLM-based summarization (if anyone wants it; the core doesn't)

## Consequences

### Positive

- Core remains small and focused
- Public OSS can stay generic; specific use cases live in separate plugin repositories
- Third parties can extend Kizuna without forking
- Clear architectural boundary supports the project's legal/licensing requirements
- Plugins can be developed and released independently

### Negative

- More complex than a monolithic design
- Plugin authors must understand the hook points and API contracts
- Bugs can occur at plugin boundaries (e.g., a plugin returning an unexpected type)
- Performance overhead of multiple plugin invocations per pipeline (mitigated by latency budgets)
- The plugin API itself is a stability commitment; breaking changes affect all plugin authors

### Constraints introduced

- The plugin API must be carefully designed before stabilization (Phase 3 includes plugin API stabilization)
- Migration policy: plugin API breaking changes require a major version bump of `@kizuna/core`
- Plugin authors must declare `@kizuna/core` as a peer dependency with a compatible version range
- Performance budgets per hook (documented in `05-plugin-api.md`) must be enforced via code review or runtime monitoring

## Implementation Strategy

The plugin architecture is built in Phase 3, NOT Phase 2. Phase 2 builds the core pipelines without plugin invocations. This allows:

- Validating the core design through real usage before committing to a plugin API
- Refactoring the core if usage reveals issues, without breaking plugin contracts
- Adding plugin support as a clean, separable change

When the core is added in Phase 2, the pipeline functions are designed to be extensible (e.g., they accept transformer functions or have clear "hook here" comments). The actual plugin API surfaces this in Phase 3.

## Validation

The plugin architecture is validated by implementing two reference plugins in Phase 3:

1. **`@kizuna/plugin-pii-sanitizer`**: A simple stateless transformation plugin demonstrating `beforeCapture`
2. **`@kizuna/plugin-multi-repo-sharing`**: A more complex plugin demonstrating migrations, query filtering, result annotation, and configuration

If implementing these plugins reveals API gaps or awkwardness, the API is revised before declaring it stable.

## Future Considerations

- **Plugin discovery via npm registry search**: Phase 5 might add a CLI command to list available `@kizuna/plugin-*` packages on npm
- **Plugin sandboxing**: Currently plugins are trusted (they have full database access). Future versions might restrict plugins to specific tables or capabilities
- **Cross-language plugins**: A future phase might support Python or Rust plugins via a wrapper protocol; the current TypeScript-only API is sufficient for the foreseeable future
- **Plugin marketplaces**: Third-party listings or registries; not needed in the near term given Kizuna's small audience
