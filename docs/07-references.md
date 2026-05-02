# References and Acknowledgments

This document collects external resources that influenced Kizuna's design, including direct inspirations, related projects, and supporting technologies.

## Direct Inspirations

These projects are the foundation of Kizuna's design. The seven core design principles are inherited directly from them.

### sui-memory

- **Repository**: https://github.com/noprogllama/sui-memory
- **Author**: noprogllama
- **Article**: ["Claude Codeに長期記憶を持たせたら、壁打ちの質が変わった"](https://zenn.dev/noprogllama/articles/7c24b2c2410213)

sui-memory established the six core design principles for Claude Code memory tools. Most importantly, it introduced the "always recall" principle (UserPromptSubmit hook for automatic injection) which fundamentally differs from MCP-based explicit search approaches. Kizuna's hook-based architecture follows this lineage.

### Engram

- **Repository**: https://github.com/okamyuji/engram
- **Author**: okamyuji
- **Article**: ["Engram - Claude Codeの会話を自動記録し、過去の記憶を検索・注入するローカル長期記憶システム"](https://zenn.dev/okamyuji/articles/engram-claude-code-local-memory)

Engram is a TypeScript implementation that built on sui-memory and added the seventh principle: DB bloat prevention. Kizuna's TypeScript-based monorepo, the FTS5 trigram tokenizer with CJK n-gram pre-processing, and the maintenance throttle are all directly inspired by Engram's design.

Engram's article documenting the experience of claude-mem's ChromaDB index growing to 420 GB was particularly influential in Kizuna's emphasis on bounded growth.

## Related Projects

These projects address similar problems with different approaches. Studying them informed Kizuna's positioning.

### claude-mem

- **Repository**: https://github.com/thedotmack/claude-mem
- **Distinguishing approach**: AI-based compression using Claude Agent SDK; MCP-based search

claude-mem represents the AI-summarization approach that Kizuna explicitly avoids in its core (per Principle 2). Its MCP-only search means it depends on the model deciding to call search tools, which Kizuna avoids via hook-based injection.

### mcp-memory-service

- **Repository**: https://github.com/doobidoo/mcp-memory-service
- **Distinguishing approach**: REST API + knowledge graph + autonomous consolidation

A more feature-rich, server-oriented approach. Kizuna's local-first single-binary philosophy is intentionally simpler.

### KIOKU (megaphone-tokyo)

- **Repository**: https://github.com/megaphone-tokyo/kioku
- **Distinguishing approach**: Auto-accumulates conversations into an Obsidian Wiki

This project shares the name "kioku" (記憶, memory) with our predecessor consideration, but differs in approach (Markdown/Wiki-based) and was discovered during Kizuna's naming research. We chose "Kizuna" (絆, bond) instead, partly to avoid confusion and partly to better reflect Kizuna's multi-agent collaboration focus.

### memsearch

- **Repository**: https://github.com/zilliztech/memsearch
- **Distinguishing approach**: Markdown as source of truth, Milvus as vector index

A strong cross-platform memory tool. Kizuna's scope is more focused (Claude Code specifically) and dependencies are smaller (single SQLite file vs. Milvus).

### Other Notable Projects

- **mem0** (https://github.com/mem0ai/mem0) — Universal memory layer for AI Agents (cloud-oriented)
- **MemOS** (https://github.com/MemTensor/MemOS) — AI memory OS for LLM and Agent systems
- **agentmemory** (https://github.com/rohitg00/agentmemory) — Persistent memory for AI coding agents with iii-engine
- **claude-memory-compiler** (https://github.com/coleam00/claude-memory-compiler) — Conversation compilation into knowledge articles

## Supporting Technologies

### Claude Code

- **Documentation**: https://docs.claude.com/en/docs/claude-code
- **Hook reference**: https://docs.claude.com/en/docs/claude-code/hooks

Kizuna integrates with Claude Code via three hooks (SessionStart, UserPromptSubmit, SessionEnd). Understanding the hook lifecycle is essential for working on the capture and inject pipelines.

### Model Context Protocol (MCP)

- **Specification**: https://spec.modelcontextprotocol.io
- **TypeScript SDK**: https://github.com/modelcontextprotocol/typescript-sdk

The MCP server in Phase 3 uses the official TypeScript SDK with stdio transport.

### SQLite and FTS5

- **SQLite documentation**: https://www.sqlite.org/docs.html
- **FTS5 documentation**: https://www.sqlite.org/fts5.html
- **Trigram tokenizer**: https://www.sqlite.org/fts5.html#the_trigram_tokenizer

The trigram tokenizer is critical for Japanese full-text search support. Engram's article on CJK n-gram handling was instructive for getting Japanese search to work correctly.

### better-sqlite3

- **Repository**: https://github.com/WiseLibs/better-sqlite3
- **Documentation**: https://github.com/WiseLibs/better-sqlite3/blob/master/docs/api.md

Synchronous SQLite bindings for Node.js. The "minimal dependencies" principle is satisfied by depending only on this single library in the core.

### sqlite-vec (For Future Hybrid Search)

- **Repository**: https://github.com/asg017/sqlite-vec

A SQLite extension for vector search. Reserved for the optional hybrid-search plugin in Phase 5; not part of the core.

## Articles and Resources

### Karpathy's LLM Knowledge Base

- **Original article reference**: Andrej Karpathy's discussions of LLM-organized knowledge bases

Several memory tools (claude-mem, claude-memory-compiler) cite this as inspiration for organizing AI conversations into structured knowledge. Kizuna's approach is different (chunk-level retrieval rather than article compilation) but the underlying motivation is shared.

### Conventional Commits

- **Specification**: https://www.conventionalcommits.org

Kizuna uses Conventional Commits format for all commit messages.

### Semantic Versioning

- **Specification**: https://semver.org

Kizuna's plugin API and core packages follow semantic versioning.

## Tools and Development Environment

### mise

- **Documentation**: https://mise.jdx.dev

Kizuna uses mise for Node.js and pnpm version management. The `mise.toml` in the repository pins the development environment.

### pnpm

- **Documentation**: https://pnpm.io

Kizuna uses pnpm for monorepo workspace management.

### TypeScript

- **Documentation**: https://www.typescriptlang.org/docs

Kizuna is written in TypeScript with strict mode enabled.

### vitest

- **Documentation**: https://vitest.dev

Kizuna uses vitest for unit and integration testing.

## Acknowledgment

We are deeply grateful to the open-source community working on Claude Code memory tools. The rapid iteration of ideas across Engram, sui-memory, claude-mem, and dozens of other projects has been remarkable to watch.

Special thanks to:

- **noprogllama** for sui-memory and the original six principles
- **okamyuji** for Engram, the seventh principle, and a thorough Japanese-language treatment of the design space

Kizuna would not exist without their work. We have tried to honor their contributions by inheriting their principles directly and citing them clearly.

## Reciprocal Spirit

Kizuna is published under MIT in part to enable derivative works in this same spirit. If you fork Kizuna or build on its ideas:

- You are not required to credit Kizuna (the MIT license is permissive)
- But credit is appreciated, especially in articles or major derivatives
- Sharing your design lessons benefits the whole ecosystem
