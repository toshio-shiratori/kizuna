# 0007. No LLM dependency in the core

**Status**: Accepted

**Date**: 2026-05-02

## Context

Memory tools for AI agents face a recurring design question: should the tool itself use an LLM to process content (summarize, extract entities, classify importance, etc.)?

Several established memory tools take this approach:

- **claude-mem** uses the Claude Agent SDK to compress sessions into summaries
- **claude-memory-compiler** uses LLMs to compile daily logs into knowledge articles
- **mem0** uses LLMs for memory extraction and consolidation

The benefits are real: LLM-based summarization can produce higher-quality compact representations than rule-based chunking. Entity extraction can identify what matters in a session.

However, LLM-based processing has costs:

- **Token cost**: Every save operation incurs API charges
- **Latency**: LLM calls add seconds to operations that should be fast
- **Reliability**: LLM-based processing can fail, hallucinate, or produce inconsistent results
- **Privacy**: Content sent to LLM APIs leaves the local machine
- **Dependency**: Requires API credentials, network connectivity, and a working LLM service

For Kizuna's specific design goals (local-first, zero-cost-on-save, always-recall via hooks), LLM dependency is particularly problematic:

- The hook fires on every session end; LLM cost would accumulate quickly
- The hook also fires on every prompt submit; LLM-based query processing would add unacceptable latency
- The "no external dependencies" principle (Principle 1) is fundamentally incompatible with API-based LLM calls
- Engram's documentation discusses this tradeoff explicitly and chose rule-based processing

Alternatives considered:

1. **No LLM in core; rule-based only** — Engram's approach
2. **LLM in core, optional** — claude-mem's approach with a config flag
3. **LLM in core, required** — Some early designs of memory tools
4. **Local LLM in core** — Use a small local model (Ollama, llamafile)
5. **LLM as a plugin** — The core has no LLM dependency, but plugins can add it

## Decision

The Kizuna core has NO LLM dependency. All processing in the core (chunking, indexing, search, ranking) is rule-based.

Plugins MAY use LLMs at their own discretion, but:

- They must clearly document this in their README
- Their cost implications must be disclosed
- They must be opt-in (not enabled by default)
- They must respect the latency budgets defined in the plugin API

## Rationale

### Why no LLM in the core

- **Principle 1 (No external dependencies)**: An LLM-using core requires either an API service or a local model download, both of which violate this principle
- **Principle 2 (Zero token cost on save)**: An LLM-using core directly violates this principle
- **Predictable performance**: Rule-based processing has known latency; LLM calls have variable latency
- **Predictable cost**: Free
- **Reliability**: Rule-based processing always works; LLM calls fail in many ways
- **Privacy**: All content stays local
- **Engram's precedent**: Engram demonstrated rule-based chunking is sufficient for the core use case
- **Quality is "good enough"**: For the always-recall pattern, retrieving slightly more verbose chunks is acceptable; perfect summarization is not required

### Why not "LLM in core, optional"

- An opt-in LLM in the core still requires the core to have LLM-related code, dependencies, and configuration surface area
- Users not using the LLM feature still bear the maintenance and code-size cost
- Plugin architecture is the better mechanism for opt-in features
- The line between "core feature with optional flag" and "plugin" should be drawn at "is this universally needed?" — LLM processing is not universally needed

### Why not local LLM (Ollama, llamafile)

- Local LLMs require model downloads (often gigabytes), violating "minimal dependencies"
- Local LLM inference is slow on most hardware, exceeding hook latency budgets
- Setup complexity (running Ollama, managing models) raises adoption friction
- A future plugin can add this if there's demand

### Why allow plugins to use LLMs

- Some users genuinely benefit from LLM features (e.g., a summarization plugin for very verbose sessions)
- Users opting into a plugin understand they're opting into the plugin's tradeoffs
- Different users have different needs; plugins enable per-user customization
- Plugin sandboxing (via the plugin API) means LLM failures in one plugin don't affect the core

## Consequences

### Positive

- Core remains fast, free, and reliable
- No API key management in the core
- No network requirement for normal operation
- Predictable behavior
- Lower barrier to adoption (no API account needed)
- Aligned with privacy-conscious users

### Negative

- Chunk quality is determined by rule-based heuristics, which may be less optimal than LLM-based extraction
- Users wanting "summarize my whole session into bullet points" need a plugin or a different tool
- Search relevance depends on FTS5 + BM25; LLM-based reranking is not available out of the box

The first negative is mitigated by the always-recall pattern: even slightly less optimal chunks are useful when injected automatically. The second is mitigated by allowing plugins to add LLM features for users who want them.

### Constraints introduced

- The capture pipeline must be implementable without LLM calls
- The search pipeline must rank results algorithmically (BM25 + time decay + importance)
- Importance scoring is heuristic-based (e.g., chunks containing decision keywords get higher scores)
- Entity extraction is regex-based or pattern-matching, not semantic

## Implementation Notes

### Rule-based chunking strategy

The capture pipeline chunks transcripts using these rules (configurable):

- One chunk per turn (user message or assistant response)
- Long turns are split at paragraph boundaries to keep chunk size manageable
- Code blocks are kept together (not split mid-block)
- Trivial turns (acknowledgments like "OK", "thanks") may be merged with adjacent substantial turns or filtered

### Rule-based importance scoring

Default importance is 5 (on a 0-10 scale). Heuristics that adjust importance:

- Decision keywords ("decided", "we will", "agreed", "決定", "合意") → +2
- Question-and-answer pairs → +1
- Code blocks with implementation details → +1
- Pure conversational fluff → -2

These rules are tunable via plugin if users want different behavior.

### Search ranking formula

The default ranking combines:

```
score = bm25_score * time_decay * (1 + importance / 10)
```

Where:

- `bm25_score` is FTS5's built-in BM25 score
- `time_decay = exp(-ln(2) * age_days / half_life_days)` with `half_life_days = 30`
- `importance` is 0-10

This is a deterministic, free, fast formula. Plugins can replace it via the search hooks.

## Future Considerations

### Possible LLM-using plugins

- `@kizuna/plugin-summarizer`: An opt-in plugin that summarizes long sessions using a local or remote LLM
- `@kizuna/plugin-entity-extractor`: Extracts named entities (function names, file paths, decisions) using LLM-based NER
- `@kizuna/plugin-llm-reranker`: Rerank search results using an LLM for relevance

These would all be separate npm packages, opt-in, with clear cost disclosure.

### Embedding-based search (different from LLM)

Note that **vector embeddings are not LLM calls** in the same sense. Generating embeddings can be done with small local models (e.g., Ruri v3-30m at ~37MB). This is a separate decision documented in the future hybrid-search plugin design (Phase 5), not in this ADR. Embedding-based search may be added without violating this ADR's spirit, since:

- Small local embedding models are within the "minimal dependencies" interpretation if they're an opt-in plugin
- Embedding-based search has predictable cost (zero ongoing) and acceptable latency

The decision on hybrid search is deferred to Phase 5 and will get its own ADR if pursued.
