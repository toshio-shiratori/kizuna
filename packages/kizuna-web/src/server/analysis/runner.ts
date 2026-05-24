import type { Database } from "@kizuna/core";
import type {
  AnalysisRule,
  AnalysisInput,
  AnalysisReport,
  Finding,
  SessionData,
  ChunkData,
} from "./types.js";
import { reworkDetectionRule } from "./rules/rework-detection.js";
import { repeatedErrorsRule } from "./rules/repeated-errors.js";
import { testFixLoopRule } from "./rules/test-fix-loop.js";
import { manualRepetitionRule } from "./rules/manual-repetition.js";
import { longSessionsRule } from "./rules/long-sessions.js";

const defaultRules: AnalysisRule[] = [
  reworkDetectionRule,
  repeatedErrorsRule,
  testFixLoopRule,
  manualRepetitionRule,
  longSessionsRule,
];

interface RawSession {
  id: string;
  project_id: string;
  started_at: string;
  ended_at: string | null;
}

interface RawChunk {
  id: number;
  session_id: string;
  turn_index: number;
  role: string;
  content: string;
  token_count: number;
  created_at: string;
}

function loadProjectData(db: Database, projectId: string): AnalysisInput {
  const rawSessions = db.db
    .prepare(
      `SELECT id, project_id, started_at, ended_at FROM sessions WHERE project_id = ? ORDER BY started_at DESC`,
    )
    .all(projectId) as RawSession[];

  const sessions: SessionData[] = rawSessions.map((s) => ({
    id: s.id,
    projectId: s.project_id,
    startedAt: s.started_at,
    endedAt: s.ended_at,
  }));

  const rawChunks = db.db
    .prepare(
      `SELECT c.id, c.session_id, c.turn_index, c.role, c.content, c.token_count, c.created_at
       FROM chunks c
       JOIN sessions s ON c.session_id = s.id
       WHERE s.project_id = ?
       ORDER BY c.created_at ASC`,
    )
    .all(projectId) as RawChunk[];

  const chunks: ChunkData[] = rawChunks.map((c) => ({
    id: c.id,
    sessionId: c.session_id,
    turnIndex: c.turn_index,
    role: c.role as "user" | "assistant",
    content: c.content,
    tokenCount: c.token_count,
    createdAt: c.created_at,
  }));

  return { sessions, chunks };
}

function buildSummary(findings: Finding[]): AnalysisReport["summary"] {
  const bySeverity = { critical: 0, warning: 0, info: 0 };
  const byPattern: Record<string, number> = {};

  for (const f of findings) {
    bySeverity[f.severity]++;
    byPattern[f.pattern] = (byPattern[f.pattern] ?? 0) + 1;
  }

  return {
    totalFindings: findings.length,
    bySeverity,
    byPattern,
  };
}

export function runAnalysis(
  db: Database,
  projectId: string,
  rules: AnalysisRule[] = defaultRules,
): AnalysisReport {
  const input = loadProjectData(db, projectId);

  const allFindings: Finding[] = [];

  for (const rule of rules) {
    const findings = rule.analyze(input);
    allFindings.push(...findings);
  }

  // Sort: critical first, then warning, then info; within same severity, by count descending
  const severityOrder: Record<string, number> = { critical: 0, warning: 1, info: 2 };
  allFindings.sort((a, b) => {
    const sev = severityOrder[a.severity]! - severityOrder[b.severity]!;
    if (sev !== 0) return sev;
    return b.count - a.count;
  });

  return {
    project: projectId,
    analyzedSessions: input.sessions.length,
    findings: allFindings,
    summary: buildSummary(allFindings),
  };
}
