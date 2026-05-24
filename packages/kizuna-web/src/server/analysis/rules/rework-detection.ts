import type { AnalysisRule, AnalysisInput, Finding, ChunkData } from "../types.js";

// Japanese keywords (no word boundaries needed)
const jaKeywords = ["やり直し", "元に戻す", "前の状態に戻", "取り消"];

// English keywords (use word-boundary matching)
const enKeywords = ["revert", "undo", "go back", "restore", "roll back", "rollback"];

const enPattern = new RegExp(`\\b(?:${enKeywords.join("|")})\\b`, "i");

function containsReworkKeyword(text: string): boolean {
  for (const kw of jaKeywords) {
    if (text.includes(kw)) return true;
  }
  return enPattern.test(text);
}

interface ReworkInstance {
  sessionId: string;
  userContent: string;
}

export const reworkDetectionRule: AnalysisRule = {
  id: "rework-detection",
  name: "Rework Detection",

  analyze(input: AnalysisInput): Finding[] {
    const chunksBySession = new Map<string, ChunkData[]>();
    for (const chunk of input.chunks) {
      const list = chunksBySession.get(chunk.sessionId) ?? [];
      list.push(chunk);
      chunksBySession.set(chunk.sessionId, list);
    }

    const instances: ReworkInstance[] = [];

    for (const [sessionId, chunks] of chunksBySession) {
      // Sort by turnIndex
      const sorted = chunks.slice().sort((a, b) => a.turnIndex - b.turnIndex);

      for (let i = 0; i < sorted.length; i++) {
        const chunk = sorted[i]!;
        if (chunk.role !== "user") continue;
        if (!containsReworkKeyword(chunk.content)) continue;

        // Check if there is a subsequent assistant response (correction)
        const next = sorted[i + 1];
        if (next && next.role === "assistant") {
          instances.push({
            sessionId,
            userContent: chunk.content.slice(0, 200),
          });
        }
      }
    }

    if (instances.length === 0) return [];

    const sessionIds = [...new Set(instances.map((i) => i.sessionId))];
    const severity = instances.length >= 5 ? "warning" : "info";

    return [
      {
        pattern: "rework-detection",
        patternLabel: "Rework Detection",
        severity,
        description: `Detected ${instances.length} rework request(s) across ${sessionIds.length} session(s). Keywords like "undo", "revert", "やり直し" were found in user messages followed by assistant corrections.`,
        sessionIds,
        suggestion:
          "Frequent rework may indicate unclear initial instructions or missing context in hooks. Consider adding more specific guidance in UserPromptSubmit hooks or CLAUDE.md rules.",
        count: instances.length,
      },
    ];
  },
};
