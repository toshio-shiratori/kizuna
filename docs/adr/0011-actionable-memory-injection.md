# 0011. Use action directives in memory injection

**Status**: Accepted

**Date**: 2026-05-09

## Context

Kizuna injects recalled memories into Claude Code prompts via the UserPromptSubmit hook. In PR #50, an attribution instruction was added asking the agent to mention which memories informed its response. However, real-world usage revealed that this passive instruction is insufficient.

### The problem

In a multi-agent workflow (Architect -> Coder -> Reviewer), an agent was tasked with removing an API endpoint. Kizuna had memories showing that the endpoint was deployed and actively used by a sibling repository. These memories were injected but the agent did not use them to verify cross-repo impact before proceeding.

The root cause is that the attribution instruction is passive:

> "If any of the above memories informed your response, briefly note which memory was relevant at the end of your reply."

This asks agents to _mention_ memories but does not instruct them to _verify and act on_ the information. Agents treat recalled memories as optional context rather than actionable constraints.

### Design tension

There is a spectrum of how strongly injected instructions can direct agent behavior:

1. **Passive attribution** (current): "mention if you used a memory" - minimal overhead, easily ignored
2. **Active verification**: "check memories for constraints before proceeding" - moderate overhead, stronger guidance
3. **Hard blocking**: "refuse to proceed if memories indicate risk" - maximum safety, risk of false positives and workflow disruption

Option 3 is inappropriate because Kizuna cannot reliably determine which memories represent hard constraints vs. historical context. The FTS search returns relevant chunks but has no semantic understanding of whether a chunk represents a deployment constraint, a past design decision, or casual conversation.

## Decision

Replace the passive attribution instruction with an active verification directive that asks agents to check recalled memories for actionable constraints before proceeding with implementation.

The new instruction:

```
If any of the above memories are relevant to your current task, verify whether they indicate
cross-repo dependencies, deployment constraints, or past design decisions that should inform
your approach. Briefly note which memories you considered at the end of your reply.
```

This is a single constant change in `inject.ts` (`ATTRIBUTION_INSTRUCTION`).

## Rationale

### Why active verification over passive attribution

- Real-world failure demonstrated that passive attribution does not change agent behavior
- Active verification is a lightweight prompt engineering change with no code complexity
- The instruction is suggestive, not blocking: it guides agent attention without preventing action
- Token cost is minimal (the instruction is ~40 tokens regardless of phrasing)

### Why not hard blocking

- FTS search has no semantic understanding of constraint severity
- False positives would disrupt normal workflows
- Blocking would require a classification layer (chunk categorization) that does not yet exist
- The design principle of "hook failures must not break the user's workflow" (ADR-0008) applies here in spirit: injection should augment, not obstruct

### Why a single instruction rather than per-chunk annotations

Issue #53 proposes chunk categorization (`[DEPLOY]`, `[CROSS-REPO]`, etc.) as proposal C. This is deferred because:

- It requires content analysis that approaches LLM-based classification, conflicting with Principle 7 (no LLM in core)
- Rule-based classification (regex/keyword) would be fragile and produce false labels
- The simpler approach (better instruction) should be validated first before adding complexity

## Consequences

### Positive

- Agents are more likely to consider recalled memories as actionable input
- No additional token cost or latency compared to the current attribution instruction
- No new code complexity; a constant string change
- Can be iterated on quickly if the phrasing proves insufficient

### Negative

- The instruction may still be ignored by some models or in some contexts
- The phrasing is generic; project-specific constraints (e.g., "always check deployment status") cannot be expressed
- Effectiveness depends on model instruction-following quality, which varies

### Future directions

- **Chunk categorization** (Issue #53 proposal C): If active verification proves insufficient, structured metadata on chunks could help agents triage memories
- **Project-specific directives**: Allow users to configure custom instructions in `.kizuna/config.json` that are appended to the injection
- **Effectiveness measurement**: Track whether agents actually reference memories more frequently after this change
