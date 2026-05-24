import type { AnalysisRule, AnalysisInput, Finding, SessionData } from "../types.js";

/**
 * Detect abnormally long sessions by chunk count or duration.
 *
 * Statistical approach: flag sessions with values > mean + 2 standard deviations.
 * Fallback for small datasets (< 5 sessions): use absolute thresholds.
 */

const ABSOLUTE_CHUNK_THRESHOLD = 50;
const ABSOLUTE_DURATION_HOURS = 3;
const MIN_SESSIONS_FOR_STATS = 5;

function computeStats(values: number[]): { mean: number; stddev: number } {
  if (values.length === 0) return { mean: 0, stddev: 0 };

  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const stddev = Math.sqrt(variance);

  return { mean, stddev };
}

function getDurationHours(session: SessionData): number | null {
  if (!session.endedAt) return null;

  const start = new Date(session.startedAt).getTime();
  const end = new Date(session.endedAt).getTime();

  if (isNaN(start) || isNaN(end)) return null;
  if (end <= start) return null;

  return (end - start) / (1000 * 60 * 60);
}

export const longSessionsRule: AnalysisRule = {
  id: "long-sessions",
  name: "Long Sessions",

  analyze(input: AnalysisInput): Finding[] {
    if (input.sessions.length === 0) return [];

    // Count chunks per session
    const chunkCounts = new Map<string, number>();
    for (const chunk of input.chunks) {
      chunkCounts.set(chunk.sessionId, (chunkCounts.get(chunk.sessionId) ?? 0) + 1);
    }

    // Compute durations per session
    const durations = new Map<string, number>();
    for (const session of input.sessions) {
      const hours = getDurationHours(session);
      if (hours !== null) {
        durations.set(session.id, hours);
      }
    }

    const findings: Finding[] = [];
    const useStats = input.sessions.length >= MIN_SESSIONS_FOR_STATS;

    // Chunk count analysis
    const chunkValues = input.sessions.map((s) => chunkCounts.get(s.id) ?? 0);
    const chunkStats = computeStats(chunkValues);
    const chunkThreshold = useStats
      ? chunkStats.mean + 2 * chunkStats.stddev
      : ABSOLUTE_CHUNK_THRESHOLD;

    for (const session of input.sessions) {
      const count = chunkCounts.get(session.id) ?? 0;
      if (count > chunkThreshold && count > 5) {
        // Require at least some chunks to be meaningful
        findings.push({
          pattern: "long-sessions",
          patternLabel: "Long Sessions",
          severity: count > chunkThreshold * 1.5 ? "warning" : "info",
          description: `Session has ${count} chunks (threshold: ${Math.round(chunkThreshold)}). This is significantly more than average and may indicate struggling with a task.`,
          sessionIds: [session.id],
          suggestion:
            "Long sessions often indicate difficulty with a task. Consider breaking complex tasks into smaller sub-tasks, improving initial context via hooks, or documenting common patterns in CLAUDE.md.",
          count,
        });
      }
    }

    // Duration analysis
    const durationValues = [...durations.values()];
    const durationStats = computeStats(durationValues);
    const durationThreshold = useStats
      ? durationStats.mean + 2 * durationStats.stddev
      : ABSOLUTE_DURATION_HOURS;

    for (const session of input.sessions) {
      const hours = durations.get(session.id);
      if (hours !== undefined && hours > durationThreshold) {
        // Check if we already have a finding for this session from chunk count
        const alreadyFlagged = findings.some(
          (f) => f.sessionIds.length === 1 && f.sessionIds[0] === session.id,
        );

        if (!alreadyFlagged) {
          findings.push({
            pattern: "long-sessions",
            patternLabel: "Long Sessions",
            severity: hours > durationThreshold * 1.5 ? "warning" : "info",
            description: `Session lasted ${hours.toFixed(1)} hours (threshold: ${durationThreshold.toFixed(1)}h). This is significantly longer than average.`,
            sessionIds: [session.id],
            suggestion:
              "Long-running sessions may indicate difficulty with a task. Consider providing more context in hooks or breaking work into smaller increments.",
            count: Math.round(hours * 60), // minutes as a count metric
          });
        }
      }
    }

    // Sort by count descending
    findings.sort((a, b) => b.count - a.count);

    return findings;
  },
};
