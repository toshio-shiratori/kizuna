type Severity = "info" | "warning" | "critical";

export interface Finding {
  /** Machine-readable pattern identifier */
  pattern: string;
  /** Severity level */
  severity: Severity;
  /** i18n key for the description template */
  descriptionKey: string;
  /** Interpolation params for the description template */
  descriptionParams: Record<string, string | number>;
  /** Session IDs where this pattern was detected */
  sessionIds: string[];
  /** i18n key for the suggestion */
  suggestionKey: string;
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
