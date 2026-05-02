# 0008. Use Claude Code hooks for capture and recall

**Status**: Accepted

**Date**: 2026-05-02

## Context

Kizuna needs to integrate with Claude Code to:

1. Capture session content for storage (the save path)
2. Inject relevant memories into Claude Code's context (the recall path)

Claude Code provides several integration mechanisms:

- **Hooks**: Lifecycle callbacks (SessionStart, UserPromptSubmit, SessionEnd, PreCompact, etc.) that fire at well-defined moments
- **MCP servers**: Tools that the agent can invoke during a session
- **CLAUDE.md**: Static context that's loaded at session start
- **Slash commands**: User-triggered commands

The save and recall paths have different requirements that affect this choice:

### Save path requirements

- Must capture session content automatically (Principle 3: auto save)
- Should not interfere with the user's workflow
- Latency is not critical (can run in background after session ends)
- Reliability is important (don't lose session content)

### Recall path requirements

- Must surface relevant memories without explicit user invocation (Principle 4: always recall)
- Latency is critical (cannot delay the user's prompt)
- Must work even if the model doesn't think to search

The key design tension is in the recall path. Two approaches exist:

**Approach A: MCP-based recall** — Provide a `kizuna_search` MCP tool. The model decides whether to invoke it based on the user's prompt. This is what claude-mem and many other tools do.

**Approach B: Hook-based recall** — Use the UserPromptSubmit hook to automatically search and inject relevant memories before the model sees the prompt. This is what sui-memory pioneered and Engram adopted.

The same tension exists for save:

**Approach A: MCP-based save** — Provide a `kizuna_save` MCP tool that the model invokes when it decides something is worth saving.

**Approach B: Hook-based save** — Use SessionEnd hook to automatically save the entire session.

Alternatives considered:

1. **Hook-based for both save and recall** (sui-memory / Engram approach)
2. **MCP-based for both** (claude-mem approach)
3. **Hook for save, MCP for recall**
4. **Hook for recall, MCP for save**
5. **Hybrid**: Both available, user chooses

## Decision

Use Claude Code hooks as the primary integration mechanism for both capture and recall:

- **SessionEnd hook** for capture (save the entire session transcript)
- **UserPromptSubmit hook** for recall (inject relevant memories into every prompt)
- **SessionStart hook** for baseline context injection (recent decisions, important memories)

Additionally provide an **MCP server** with explicit tools (`kizuna_search`, `kizuna_save`, etc.) for cases where the agent or user wants to actively search or save. The MCP server is supplementary, not a replacement for hooks.

## Rationale

### Why hooks for recall (the critical decision)

Approach A (MCP-based recall) has a fundamental reliability problem: **the model decides whether to search**. This means:

- If the user's prompt doesn't obviously suggest a search is needed, the model won't search
- If the model is in a rush or distracted by other tools, it skips search
- Different models behave differently; a switch from one model to another can break recall
- The user has no way to ensure recall happens

For a memory system whose value is "ambient context awareness," this is unacceptable. Memories should always be surfaced when relevant, not only when the model thinks to look.

Approach B (hook-based recall) makes recall deterministic:

- Every prompt triggers a search and injection
- The user can be confident relevant context is always available
- The model receives the augmented prompt without choosing to do so
- Behavior is predictable across models and sessions

This is sui-memory's signature contribution to the design space. It's the right choice for Kizuna.

### Why hooks for save

The same logic largely applies. Asking the model to call `kizuna_save` for important content means:

- The model has to decide what's important (it often doesn't, mid-flow)
- Saves are inconsistent across sessions
- The user can't be confident anything was saved

SessionEnd hook makes save deterministic: the entire session is captured. Filtering for importance happens in the chunking and ranking stages, which are deterministic too.

### Why also provide MCP tools

Hooks have limitations:

- A user mid-session who explicitly wants to search older memories can't trigger the recall hook on demand
- A user who wants to save something specific (e.g., a decision) earlier than session end has no mechanism
- Sub-agents in Claude Code's agent system may benefit from explicit search capability

MCP tools fill these gaps. The combination is:

- **Hooks**: Always-on, deterministic, automatic
- **MCP**: On-demand, model-driven or user-driven, supplementary

This dual approach gives both reliability (via hooks) and flexibility (via MCP).

### Why SessionStart for baseline context

The UserPromptSubmit hook injects content relevant to each specific prompt. But some content should be available from the start of a session:

- Recently made important decisions
- Open questions awaiting resolution
- Active context from the last session

SessionStart hook is appropriate for this. The injected content is small (target: < 500 tokens) and shapes the session's overall awareness, rather than reacting to specific prompts.

### Why not also use PreCompact

Claude Code provides a PreCompact hook that fires before automatic context compaction. Some memory tools use this to capture context before it's lost.

For Kizuna's design, PreCompact is unnecessary because:

- SessionEnd captures everything; nothing is lost
- Mid-session compaction is mostly cosmetic; the underlying session content remains in the transcript
- Adding PreCompact handling would complicate the hook architecture

PreCompact may be revisited if it proves needed.

## Consequences

### Positive

- Recall is deterministic; users can trust that relevant memories surface
- Save is comprehensive; no important content is missed due to model choice
- The architecture aligns with proven patterns (sui-memory, Engram)
- MCP tools provide flexibility for special cases without compromising the default behavior
- The integration is per-session and per-prompt, not requiring a long-running daemon

### Negative

- Hooks add latency to operations that would otherwise be unaffected
- Hook configuration requires user setup (mitigated by `kizuna setup` command)
- Hooks are coupled to Claude Code's hook API; future API changes require adaptation
- Other AI coding agents (Cursor, Codex, etc.) have different hook systems; Kizuna is Claude Code-first

### Constraints introduced

- UserPromptSubmit hook must complete in < 100ms to avoid user-visible delay
- SessionEnd hook should complete in < 5s; longer runs are acceptable but block session cleanup
- SessionStart hook should complete in < 200ms
- Hook handlers are short-lived processes; state must persist via SQLite, not memory
- Hook failures must not break the user's workflow; failures are logged and ignored

## Implementation Notes

### Hook registration

The `kizuna setup` CLI command modifies `~/.claude/settings.json` (or the project-local equivalent) to register the hooks. The configuration looks like:

```json
{
  "hooks": [
    {
      "matcher": "SessionStart",
      "command": "kizuna hook session-start"
    },
    {
      "matcher": "UserPromptSubmit",
      "command": "kizuna hook user-prompt-submit"
    },
    {
      "matcher": "SessionEnd",
      "command": "kizuna hook session-end"
    }
  ]
}
```

The hook commands are CLI subcommands, not separate executables. This allows shared code with the `kizuna search`, `kizuna list` commands.

### Latency budgets enforcement

Each hook handler logs its execution time. If execution exceeds the budget:

- A warning is logged
- The user is not interrupted
- Performance regression is detectable in logs

In Phase 4, monitoring tooling may be added to track p95/p99 latency.

### Failure handling

Each hook follows this pattern:

```
try:
  perform_hook_logic()
catch error:
  log_error(error)
  exit(0)  # Always exit successfully so Claude Code is not blocked
```

The exit code 0 (success) is important. Returning a non-zero code might block the user's prompt submission, which would be far worse than missing a memory injection.

### MCP server registration

The MCP server is a separate executable (`kizuna-mcp`) registered via Claude Code's MCP configuration:

```json
{
  "mcpServers": {
    "kizuna": {
      "command": "kizuna-mcp"
    }
  }
}
```

The MCP server is optional. Users who only want hook-based behavior can skip MCP setup. Users who want both run `kizuna setup --with-mcp`.

## Future Considerations

- **Cross-agent compatibility**: If demand exists, Kizuna could grow plugins for Cursor, Codex, OpenCode, etc. Each agent has different hook semantics; a plugin per agent may be the cleanest approach
- **Hook performance monitoring**: A plugin or core feature to track hook latency over time
- **Conditional hooks**: Allow users to disable specific hooks per project (e.g., disable SessionStart injection for sensitive work)
