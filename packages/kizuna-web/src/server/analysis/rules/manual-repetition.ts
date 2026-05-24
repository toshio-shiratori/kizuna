import type { AnalysisRule, AnalysisInput, Finding } from "../types.js";

/**
 * Detect commands that are manually executed across multiple sessions.
 * These are candidates for automation via hooks.
 *
 * We look for lines that appear to be shell commands:
 * - Lines starting with $ or > (common prompt indicators)
 * - Lines containing well-known command prefixes
 */

const COMMAND_PREFIXES = [
  "pnpm ",
  "npm ",
  "yarn ",
  "git ",
  "docker ",
  "make ",
  "cargo ",
  "go ",
  "python ",
  "pip ",
  "node ",
  "npx ",
  "cd ",
  "mkdir ",
  "rm ",
  "cp ",
  "mv ",
  "cat ",
  "grep ",
  "find ",
  "curl ",
  "wget ",
];

/**
 * Normalize a command for grouping:
 * - Lowercase
 * - Strip leading prompt chars ($ > #)
 * - Collapse whitespace
 * - Strip arguments that look like paths or UUIDs
 */
export function normalizeCommand(line: string): string {
  let cmd = line.trim();

  // Strip leading prompt characters
  cmd = cmd.replace(/^[$>#]\s*/, "");

  // Lowercase
  cmd = cmd.toLowerCase();

  // Collapse whitespace
  cmd = cmd.replace(/\s+/g, " ");

  // Strip UUID-like arguments
  cmd = cmd.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<id>");

  // Strip absolute path arguments (keep the command itself)
  cmd = cmd.replace(/\s\/[\w./-]+/g, " <path>");

  // Strip quoted strings
  cmd = cmd.replace(/"[^"]*"/g, "<str>");
  cmd = cmd.replace(/'[^']*'/g, "<str>");

  return cmd.trim();
}

function extractCommands(content: string): string[] {
  const lines = content.split("\n");
  const commands: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    // Lines starting with $ or > are likely commands
    if (/^[$>]\s+/.test(trimmed)) {
      const cmd = trimmed.replace(/^[$>]\s+/, "").trim();
      if (cmd.length > 3) {
        commands.push(cmd);
      }
      continue;
    }

    // Check for well-known command prefixes
    for (const prefix of COMMAND_PREFIXES) {
      if (trimmed.startsWith(prefix) && trimmed.length < 200) {
        commands.push(trimmed);
        break;
      }
    }
  }

  return commands;
}

const SESSION_THRESHOLD = 3;

export const manualRepetitionRule: AnalysisRule = {
  id: "manual-repetition",
  name: "Manual Step Repetition",

  analyze(input: AnalysisInput): Finding[] {
    // Map: normalized command -> Set of session IDs
    const commandSessions = new Map<string, Set<string>>();
    // Map: normalized command -> original command text
    const commandOriginals = new Map<string, string>();

    for (const chunk of input.chunks) {
      const commands = extractCommands(chunk.content);
      for (const cmd of commands) {
        const normalized = normalizeCommand(cmd);
        if (normalized.length < 5) continue;

        if (!commandSessions.has(normalized)) {
          commandSessions.set(normalized, new Set());
          commandOriginals.set(normalized, cmd.slice(0, 150));
        }
        commandSessions.get(normalized)!.add(chunk.sessionId);
      }
    }

    const findings: Finding[] = [];

    for (const [normalized, sessions] of commandSessions) {
      if (sessions.size < SESSION_THRESHOLD) continue;

      const original = commandOriginals.get(normalized) ?? normalized;
      const sessionIds = [...sessions];

      findings.push({
        pattern: "manual-repetition",
        patternLabel: "Manual Step Repetition",
        severity: sessionIds.length >= 6 ? "warning" : "info",
        description: `The command "${original}" was manually executed in ${sessionIds.length} sessions.`,
        sessionIds,
        suggestion:
          "This command is repeated across many sessions. Consider automating it via a Claude Code hook (UserPromptSubmit or SessionEnd) or adding it to your project scripts.",
        count: sessionIds.length,
      });
    }

    // Sort by count descending
    findings.sort((a, b) => b.count - a.count);

    return findings;
  },
};
