# Design Principles

Kizuna inherits its core design principles from [Engram](https://github.com/okamyuji/engram) and its predecessor [sui-memory](https://github.com/noprogllama/sui-memory). These principles are not negotiable. Any deviation requires explicit justification and must be recorded as an Architecture Decision Record (ADR).

## The Seven Principles

### 1. No External Dependencies

All data is stored in a single SQLite file. The core does not require:

- External APIs (cloud services, hosted databases)
- Large model downloads (embedding models, LLMs)
- Background services or daemons
- Network connectivity for normal operation

**Rationale**: Local-first design ensures privacy, reliability, and zero operational cost. Users own their data completely.

**Exception**: Optional plugins MAY require additional dependencies (e.g., a future hybrid-search plugin might use sqlite-vec). The core must remain dependency-minimal.

### 2. Zero Token Cost on Save

Memory capture uses rule-based chunking only. The core does NOT use LLM calls during the save path.

**Rationale**:

- Saving must be free and instant
- API token costs accumulate quickly when saving runs after every session
- Engram's experience showed that AI-based compression (as used by claude-mem) creates ongoing cost concerns

**Exception**: Optional summarization plugins MAY use LLMs, but they must be clearly marked as opt-in and their cost implications documented.

### 3. Auto Save

Memory capture is fully automatic via Claude Code hooks. Users never need to:

- Manually invoke a save command
- Tag content for retention
- Run periodic flush operations

**Implementation**: SessionEnd hook triggers automatic chunking and storage of the session transcript.

**Rationale**: If saving requires user action, it will be forgotten. Automatic capture is the only reliable approach.

### 4. Always Recall

Memory retrieval is fully automatic via Claude Code hooks. Relevant memories are injected into every prompt without requiring the model or user to invoke search tools.

**Implementation**: UserPromptSubmit hook performs search and prepends relevant memories to the user's prompt.

**Rationale**:

- MCP-based search (as used by claude-mem) depends on the model deciding to call the search tool — which is unreliable
- Hook-based injection is deterministic: relevant memories are ALWAYS available
- This is sui-memory's signature contribution to the design space

### 5. Edit and Delete

Users can inspect, modify, and delete stored memories via CLI commands. This includes:

- Searching memories by content
- Listing memories by session, time, or tag
- Editing individual memory chunks
- Deleting specific chunks, sessions, or time ranges
- Bulk pruning of old memories

**Rationale**: Memory is user data. Users must have full control over what is stored, what is forgotten, and what is corrected.

### 6. Minimal Dependencies

The core package depends ONLY on `better-sqlite3`. Other packages may have their own dependencies, but the dependency tree is intentionally shallow.

**Implementation guideline**:

- Each new dependency must be justified
- Heavy dependencies (web frameworks, ORMs, large utility libraries) are forbidden in the core
- Build-time dependencies (TypeScript, vitest) are acceptable but the published package must be lean

**Rationale**: Minimal dependencies mean fewer security vulnerabilities, faster installation, smaller installed footprint, and lower maintenance burden.

### 7. DB Bloat Prevention

Database maintenance is built-in from day one, not bolted on later. The system automatically:

- Removes chunks older than a configurable threshold (default: 90 days)
- Limits total database size (default: 100 MB)
- Removes empty sessions
- Reclaims disk space via WAL checkpoint

**Implementation**: Maintenance runs at most once per 24 hours during the SessionEnd hook to avoid latency on individual saves.

**Rationale**: Engram's documentation describes the experience of claude-mem's ChromaDB index growing to 420 GB. Designing for bounded growth from the start prevents this class of failure.

## Kizuna-Specific Principle

In addition to the seven inherited principles, Kizuna adds one principle specific to its multi-agent collaboration focus:

### 8. Plugin-Based Specialization

The core is generic. Project-specific or use-case-specific functionality is implemented as plugins.

**Examples of what belongs in plugins, NOT the core**:

- OpenAPI/contract awareness
- Project-specific entity extraction
- Custom chunking strategies for specific languages or frameworks
- Integration with non-MCP tools

**Examples of what belongs in the core**:

- Storage and retrieval
- Hook handling
- Plugin lifecycle management
- Configuration loading

**Rationale**:

- Kizuna is intended to be useful across many projects with different characteristics
- A monolithic design with all features built in would either be bloated or limited
- Plugins allow each project to opt into exactly the functionality they need
- This also creates a clean separation between "the generic tool" and "business-specific extensions" — important for legal and licensing clarity

## How to Apply These Principles

When making any design decision, ask:

1. Does this introduce an external dependency? (Principle 1)
2. Does this require LLM calls during save? (Principle 2)
3. Does this require manual user action? (Principles 3, 4)
4. Does this lock users out of their own data? (Principle 5)
5. Does this add a heavy dependency? (Principle 6)
6. Does this create unbounded growth? (Principle 7)
7. Does this belong in the core or in a plugin? (Principle 8)

If any answer is concerning, the design needs reconsideration.

## When Principles Conflict

Principles are listed in priority order. When in conflict:

- Principles 1-2 (no external deps, zero token cost) take priority over performance optimizations
- Principles 3-4 (auto save, always recall) take priority over user control granularity
- Principle 8 (plugin specialization) takes priority over feature richness in the core

Significant principle conflicts should be resolved through ADRs that document the tradeoff explicitly.

## Acknowledgment

Principles 1-7 are directly inherited from sui-memory and Engram. The wording has been adapted but the substance is preserved. We are deeply grateful to the authors of these projects for codifying these principles in a form that can be reused and extended.
