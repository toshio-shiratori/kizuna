# Kizuna Documentation

Welcome to Kizuna's documentation. This directory contains the project's vision, design principles, architecture, schema, plugin API, roadmap, and architecture decision records.

## How to Read This Documentation

The recommended reading order depends on your goal.

### If you are new to Kizuna

Start with these in order:

1. **[01-vision.md](./01-vision.md)** — What is Kizuna and why does it exist?
2. **[02-design-principles.md](./02-design-principles.md)** — The eight principles that guide every decision
3. **[03-architecture.md](./03-architecture.md)** — High-level system design
4. **[06-roadmap.md](./06-roadmap.md)** — Where the project is and where it's going
5. **[07-references.md](./07-references.md)** — Inspirations and acknowledgments

You should be able to understand the project's purpose and direction after reading these five.

### If you want to contribute or implement

After the introductory docs, also read:

6. **[04-schema.md](./04-schema.md)** — Database schema and storage details
7. **[05-plugin-api.md](./05-plugin-api.md)** — How plugins extend Kizuna
8. **[adr/README.md](./adr/README.md)** — Index of architectural decisions

Then read the specific ADRs relevant to your work area.

### If you are Claude Code CLI working on this project

Read in this order before any code changes:

1. The project's `CLAUDE.md` at the repository root
2. **[01-vision.md](./01-vision.md)** and **[02-design-principles.md](./02-design-principles.md)** to understand the goals and constraints
3. **[06-roadmap.md](./06-roadmap.md)** to identify the current phase
4. The phase-specific docs (architecture, schema, plugin-api as relevant)
5. All [ADRs](./adr/) to understand existing decisions

After reading, summarize back to the user what you understood, and wait for confirmation before making changes.

## Documentation Structure

```
docs/
├── README.md               (this file)
├── 01-vision.md            Vision and use cases
├── 02-design-principles.md The eight design principles
├── 03-architecture.md      High-level architecture
├── 04-schema.md            SQLite schema specification
├── 05-plugin-api.md        Plugin API specification
├── 06-roadmap.md           Phased development plan
├── 07-references.md        External references
└── adr/                    Architecture Decision Records
    ├── README.md           ADR index and conventions
    ├── 0001-use-sqlite.md
    ├── 0002-use-typescript.md
    ├── 0003-use-monorepo.md
    ├── 0004-use-mise.md
    ├── 0005-plugin-architecture.md
    ├── 0006-mit-license.md
    ├── 0007-no-llm-in-core.md
    ├── 0008-hook-based-capture.md
    └── 0009-fts5-with-cjk-ngram.md
```

## Document Status and Stability

These documents have different stability characteristics:

| Document | Stability | Update Frequency |
|----------|-----------|-------------------|
| 01-vision.md | High | Rarely (major project shifts only) |
| 02-design-principles.md | Very high | Almost never |
| 03-architecture.md | Medium | When architecture evolves |
| 04-schema.md | Medium | When schema changes (with migrations) |
| 05-plugin-api.md | Medium | Until Phase 3 stabilization, then high |
| 06-roadmap.md | Living | Updated as phases progress |
| 07-references.md | Low | When new references are worth noting |
| adr/* | Immutable | Never modified after acceptance (only superseded) |

## Conventions

### Markdown style

- Top-level heading: document title
- Use `##` for major sections, `###` for subsections
- Code blocks use triple backticks with language hints
- Cross-references use relative links: `[link text](./other-doc.md)`
- File paths in prose are wrapped in backticks: `packages/kizuna-core/src/storage`

### Citing decisions

When referencing a decision in code comments or other docs, cite the ADR by number:

```typescript
// Per ADR-0007, no LLM calls in the core save path.
function processChunk(chunk: RawChunk): RawChunk {
  // ...
}
```

This makes the link traceable and explicit.

### Cross-language notes

Some terms have specific meanings in this project:

- **Memory** / **chunk** — A stored piece of session content
- **Session** — One continuous Claude Code interaction (start to end)
- **Capture** — The process of storing content (save path)
- **Recall** — The process of retrieving content (search path)
- **Inject** — The process of adding retrieved content to a prompt (recall path's final step)
- **Hook** — A Claude Code lifecycle callback (SessionStart, etc.)
- **Plugin** — An npm package extending Kizuna's pipelines

## Updating This Documentation

### Updating an existing document

For substantive changes, update the document and commit with a `docs:` prefix:

```
docs(architecture): clarify hook latency budgets
```

For typos or minor clarifications, the same prefix applies but no further ceremony is needed.

### Adding a new document

If a topic doesn't fit existing documents:

1. Choose the next number in sequence (currently 08)
2. Create `08-your-topic.md`
3. Update this README's structure section and reading order
4. Commit with `docs: add 08-your-topic`

### Adding a new ADR

See **[adr/README.md](./adr/README.md)** for the ADR process.

### When NOT to update documentation

Avoid:

- Speculative documentation for unbuilt features (document when implemented, not before)
- Tutorial-style documentation (this is a reference, not a tutorial; tutorials live in the main README or wiki)
- Marketing copy (this is technical documentation)

## For Future Contributors (Including Future Selves)

This documentation exists because:

- Software projects accumulate context that fades from memory
- AI-assisted development tools (Claude Code, Cursor, etc.) cannot infer historical context
- Future contributors deserve to understand decisions, not just code

When in doubt about whether to document something, lean toward writing it down. Documentation that exists is rarely regretted; documentation that doesn't exist is frequently missed.

## Questions

Questions about the documentation can be raised in [GitHub Discussions](https://github.com/toshio-shiratori/kizuna/discussions) (responses are best-effort, not guaranteed).
