import type { AnalysisRule, AnalysisInput, Finding, ChunkData } from "../types.js";

/**
 * Detect test-fix loops: sequences where a test command is run, it fails,
 * code is modified, and the test is run again. A cycle is:
 *   1. Test command in an assistant chunk (tool execution)
 *   2. Failure indicator in the same or subsequent chunk
 *   3. Code change (file edit / fix language)
 *   4. Another test command
 *
 * We count such cycles per session. Sessions with >= 3 cycles are flagged.
 */

const TEST_COMMAND_PATTERN =
  /\b(?:pnpm test|npm test|yarn test|vitest|jest|pytest|cargo test|go test|make test)\b/;

const FAILURE_INDICATORS = [
  /\bFAIL\b/,
  /\bfailed\b/i,
  /\berror\b/i,
  /\bErrors?\s*:/,
  /exit code [1-9]/i,
  /non-zero exit/i,
  /test.*failed/i,
  /\d+\s+(?:failing|failed)/i,
];

function containsTestCommand(content: string): boolean {
  return TEST_COMMAND_PATTERN.test(content);
}

function containsFailure(content: string): boolean {
  return FAILURE_INDICATORS.some((p) => p.test(content));
}

const LOOP_THRESHOLD = 3;

export const testFixLoopRule: AnalysisRule = {
  id: "test-fix-loop",
  name: "Test-Fix Loop",

  analyze(input: AnalysisInput): Finding[] {
    const chunksBySession = new Map<string, ChunkData[]>();
    for (const chunk of input.chunks) {
      const list = chunksBySession.get(chunk.sessionId) ?? [];
      list.push(chunk);
      chunksBySession.set(chunk.sessionId, list);
    }

    const findings: Finding[] = [];

    for (const [sessionId, chunks] of chunksBySession) {
      const sorted = chunks.slice().sort((a, b) => a.turnIndex - b.turnIndex);
      let cycles = 0;

      // State machine: looking for test -> fail -> fix -> test
      let state: "idle" | "saw-test" | "saw-failure" = "idle";

      for (const chunk of sorted) {
        const hasTest = containsTestCommand(chunk.content);
        const hasFail = containsFailure(chunk.content);

        switch (state) {
          case "idle":
            if (hasTest) {
              state = hasFail ? "saw-failure" : "saw-test";
            }
            break;

          case "saw-test":
            if (hasFail) {
              state = "saw-failure";
            } else if (hasTest) {
              // Another test without failure; stay in saw-test
              state = "saw-test";
            }
            break;

          case "saw-failure":
            // Any subsequent chunk counts as potential fix
            if (hasTest) {
              // A new test run after failure = one cycle completed
              cycles++;
              // Reset: this test run could start a new cycle
              state = hasFail ? "saw-failure" : "saw-test";
            }
            break;
        }
      }

      if (cycles >= LOOP_THRESHOLD) {
        findings.push({
          pattern: "test-fix-loop",
          patternLabel: "Test-Fix Loop",
          severity: cycles >= 6 ? "critical" : "warning",
          description: `Detected ${cycles} test-fix cycle(s) in this session. The pattern of running tests, encountering failures, and re-running tests repeated ${cycles} times.`,
          sessionIds: [sessionId],
          suggestion:
            "Frequent test-fix loops may indicate that changes are being made without fully understanding the test expectations. Consider improving test documentation, adding type checks before testing, or breaking changes into smaller increments.",
          count: cycles,
        });
      }
    }

    // Sort by count descending
    findings.sort((a, b) => b.count - a.count);

    return findings;
  },
};
