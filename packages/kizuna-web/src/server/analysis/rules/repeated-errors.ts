import type { AnalysisRule, AnalysisInput, Finding } from "../types.js";

/**
 * Normalize an error message for grouping purposes.
 * - Lowercase
 * - Collapse whitespace
 * - Strip absolute paths (e.g. /Users/foo/bar.ts:42:10)
 * - Strip hex addresses (e.g. 0x7fff5fbff8c0)
 * - Strip line/column numbers after filenames
 * - Strip timestamps (ISO 8601 and common formats)
 */
export function normalizeError(message: string): string {
  return (
    message
      .toLowerCase()
      // Strip ISO timestamps (2025-01-01T00:00:00Z etc.)
      .replace(/\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}[.\dz]*/g, "<timestamp>")
      // Strip common date formats (2025/01/01 00:00:00 etc.)
      .replace(/\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2}/g, "<timestamp>")
      // Strip absolute paths (Unix-style)
      .replace(/\/[\w./-]+/g, "<path>")
      // Strip Windows-style paths
      .replace(/[A-Z]:\\[\w.\\-]+/gi, "<path>")
      // Strip hex addresses
      .replace(/0x[0-9a-f]+/gi, "<hex>")
      // Strip line:column numbers
      .replace(/<path>:\d+:\d+/g, "<path>:<line>")
      .replace(/<path>:\d+/g, "<path>:<line>")
      // Collapse whitespace
      .replace(/\s+/g, " ")
      .trim()
  );
}

// Patterns that identify error-like lines
const errorLinePatterns = [
  /^error:/im,
  /^Error:/m,
  /^ERROR/m,
  /^\s+at\s+/m, // stack trace lines
  /^TypeError:/m,
  /^ReferenceError:/m,
  /^SyntaxError:/m,
  /ENOENT/,
  /EACCES/,
  /EPERM/,
  /FAIL\s/,
  /\bfailed\b/i,
];

function extractErrors(content: string): string[] {
  const lines = content.split("\n");
  const errors: string[] = [];
  let currentError: string[] = [];

  for (const line of lines) {
    const isErrorLine = errorLinePatterns.some((p) => p.test(line));
    const isStackLine = /^\s+at\s+/.test(line);

    if (isErrorLine && !isStackLine) {
      // Start a new error (flush previous if any)
      if (currentError.length > 0) {
        errors.push(currentError.join("\n"));
      }
      currentError = [line.trim()];
    } else if (isStackLine && currentError.length > 0) {
      // Append stack trace to current error (limit depth)
      if (currentError.length < 4) {
        currentError.push(line.trim());
      }
    } else {
      // Flush current error
      if (currentError.length > 0) {
        errors.push(currentError.join("\n"));
        currentError = [];
      }
    }
  }

  if (currentError.length > 0) {
    errors.push(currentError.join("\n"));
  }

  return errors;
}

export const repeatedErrorsRule: AnalysisRule = {
  id: "repeated-errors",
  name: "Repeated Errors",

  analyze(input: AnalysisInput): Finding[] {
    // Map: normalized error -> Set of session IDs
    const errorSessions = new Map<string, Set<string>>();
    // Map: normalized error -> original (first seen) error text
    const errorOriginals = new Map<string, string>();

    for (const chunk of input.chunks) {
      const errors = extractErrors(chunk.content);
      for (const error of errors) {
        const normalized = normalizeError(error);
        if (normalized.length < 10) continue; // Skip very short matches

        if (!errorSessions.has(normalized)) {
          errorSessions.set(normalized, new Set());
          errorOriginals.set(normalized, error.slice(0, 200));
        }
        errorSessions.get(normalized)!.add(chunk.sessionId);
      }
    }

    const findings: Finding[] = [];

    for (const [normalized, sessions] of errorSessions) {
      if (sessions.size < 2) continue;

      const original = errorOriginals.get(normalized) ?? normalized;
      const sessionIds = [...sessions];

      findings.push({
        pattern: "repeated-errors",
        patternLabel: "Repeated Errors",
        severity: sessionIds.length >= 4 ? "critical" : "warning",
        description: `The same error appeared in ${sessionIds.length} sessions: "${original}"`,
        sessionIds,
        suggestion:
          "This error recurs across sessions. Consider adding a fix to your project configuration, updating documentation, or creating a hook that warns about this known issue.",
        count: sessionIds.length,
      });
    }

    // Sort by count descending
    findings.sort((a, b) => b.count - a.count);

    return findings;
  },
};
