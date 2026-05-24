type Severity = "info" | "warning" | "critical";

export interface Finding {
  /** Machine-readable pattern identifier */
  pattern: string;
  /** Human-readable pattern label */
  patternLabel: string;
  /** Severity level */
  severity: Severity;
  /** Human-readable description of what was found */
  description: string;
  /** Session IDs where this pattern was detected */
  sessionIds: string[];
  /** Improvement suggestion */
  suggestion: string;
  /** Number of occurrences */
  count: number;
}

export interface SessionData {
  id: string;
  projectId: string;
  startedAt: string;
  endedAt: string | null;
}

export interface ChunkData {
  id: number;
  sessionId: string;
  turnIndex: number;
  role: "user" | "assistant";
  content: string;
  tokenCount: number;
  createdAt: string;
}

export interface AnalysisInput {
  sessions: SessionData[];
  chunks: ChunkData[];
}

export interface AnalysisRule {
  /** Unique identifier for this rule */
  id: string;
  /** Human-readable name */
  name: string;
  /** Analyze the input data and return findings */
  analyze(input: AnalysisInput): Finding[];
}

export interface AnalysisReport {
  project: string;
  analyzedSessions: number;
  findings: Finding[];
  summary: {
    totalFindings: number;
    bySeverity: { critical: number; warning: number; info: number };
    byPattern: Record<string, number>;
  };
}
