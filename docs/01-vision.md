# Kizuna Vision

## What is Kizuna?

Kizuna (絆) is a plugin-based local long-term memory MCP server for Claude Code, designed for cross-repository agent collaboration.

The name "Kizuna" means "bond" in Japanese — referring to the bond that grows between AI agents as they accumulate shared understanding through shared memory.

## The Problem

When developers use multiple Claude Code agents across different repositories — for example, one for frontend development and another for backend development — these agents operate in isolation. Each agent has no awareness of decisions, learnings, or context developed in other repositories.

This isolation creates several pain points:

- **Repeated explanations**: The same context must be explained to each agent separately
- **Inconsistent decisions**: Agents in different repositories may make conflicting design choices
- **Lost knowledge**: Insights gained in one session are forgotten by the time another session starts
- **Human as middleware**: A human developer must constantly relay information between agent sessions

Existing solutions like Engram, sui-memory, and claude-mem solve the _intra-agent_ memory problem (a single agent remembering across its own sessions). Kizuna addresses the _inter-agent_ collaboration problem.

## The Vision

Kizuna gives each project its own persistent memory database. Through optional plugins, multiple Claude Code agents can read across each other's databases via cross-database read-only queries — each session only writes to its own. As agents work — across sessions, across repositories, across time — they contribute to and draw from a common understanding.

The result is a **bond between agents** that grows stronger with use:

- Decisions made in one repository become visible to agents in related repositories
- Learnings from one agent's session inform another agent's responses
- The human no longer needs to manually synchronize context between agents
- Over time, the collective memory becomes a valuable knowledge base that outlasts any single session

## Differentiation

Kizuna is not another memory tool competing in a crowded space. Its position is distinct:

| Tool       | Primary Focus                                   |
| ---------- | ----------------------------------------------- |
| Engram     | Single-agent memory across sessions             |
| sui-memory | Single-agent memory across sessions             |
| claude-mem | Single-agent memory with AI compression         |
| **Kizuna** | **Multi-agent collaboration via shared memory** |

While Kizuna inherits the design principles of single-agent memory tools (especially from Engram and sui-memory), its architecture is built from the ground up for cross-repository, multi-agent scenarios.

## Core Use Cases

1. **Cross-team development coordination**: When two or more teams develop different parts of a system using their own Claude Code agents, Kizuna ensures decisions made by one team's agent are automatically available to the other team's agents.

2. **Personal multi-project context**: A solo developer working on multiple related projects can have all their Claude Code sessions share relevant context, reducing repeated explanations.

3. **Long-running project memory**: Architectural decisions, gotchas, and conventions accumulated over weeks or months remain accessible regardless of which agent or session is active.

## What Kizuna is NOT

- **Not a replacement for CLAUDE.md**: CLAUDE.md remains the right place for stable, intentionally-written instructions. Kizuna captures dynamic context.
- **Not a knowledge base for general use**: Kizuna is optimized for AI agent consumption, not for human browsing.
- **Not a replacement for proper documentation**: Important decisions should still be documented in code comments and ADRs. Kizuna captures the working context, not the canonical record.
- **Not a cloud service**: All data is local. There is no SaaS offering.

## Project Status and Maintenance

Kizuna is a personal open-source project published under the MIT license. It is maintained on a best-effort basis only. There is no SLA, no roadmap commitment, no support guarantee.

The project is shared publicly so that:

- Other developers facing similar problems can use it
- The design ideas can contribute to the broader Claude Code ecosystem
- Forks and derivatives are welcomed

Issues and pull requests may not receive responses. Use at your own risk.

## Inspiration and Acknowledgments

Kizuna stands on the shoulders of two predecessor projects:

- **[Engram](https://github.com/okamyuji/engram)** by okamyuji — TypeScript implementation that established the modern design principles for Claude Code memory tools
- **[sui-memory](https://github.com/noprogllama/sui-memory)** by noprogllama — Original work that defined the six core principles (always-recall, zero-token-save, etc.)

Kizuna inherits these design principles directly and extends them with multi-agent collaboration support and a plugin architecture.
