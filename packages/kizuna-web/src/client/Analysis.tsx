import { useState, useEffect } from "react";
import type { DatabaseStats } from "@kizuna/core";

type Severity = "info" | "warning" | "critical";

interface Finding {
  pattern: string;
  patternLabel: string;
  severity: Severity;
  description: string;
  sessionIds: string[];
  suggestion: string;
  count: number;
}

interface AnalysisReport {
  project: string;
  analyzedSessions: number;
  findings: Finding[];
  summary: {
    totalFindings: number;
    bySeverity: { critical: number; warning: number; info: number };
    byPattern: Record<string, number>;
  };
}

const severityStyles: Record<Severity, string> = {
  critical: "bg-red-500/20 text-red-300 border-red-500/30",
  warning: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  info: "bg-blue-500/20 text-blue-300 border-blue-500/30",
};

const severityLabels: Record<Severity, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
};

function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${severityStyles[severity]}`}
    >
      {severityLabels[severity]}
    </span>
  );
}

function SummaryCard({ title, value, accent }: { title: string; value: number; accent?: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-surface p-4">
      <p className="text-sm text-text-secondary">{title}</p>
      <p className={`mt-1 text-2xl font-semibold ${accent ?? "text-text-primary"}`}>{value}</p>
    </div>
  );
}

function FindingCard({ finding }: { finding: Finding }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <SeverityBadge severity={finding.severity} />
        <span className="rounded bg-bg px-2 py-0.5 text-xs text-text-secondary">
          {finding.patternLabel}
        </span>
        <span className="text-xs text-text-secondary">
          {finding.count}x | {finding.sessionIds.length} session
          {finding.sessionIds.length !== 1 ? "s" : ""}
        </span>
      </div>

      <p className="mb-3 text-sm text-text-primary">{finding.description}</p>

      <div className="rounded border border-accent/20 bg-accent/5 p-3">
        <p className="text-xs font-medium text-accent">Suggestion</p>
        <p className="mt-1 text-sm text-text-secondary">{finding.suggestion}</p>
      </div>

      {finding.sessionIds.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-text-secondary hover:text-text-primary"
          >
            {expanded ? "Hide" : "Show"} affected sessions ({finding.sessionIds.length})
          </button>
          {expanded && (
            <div className="mt-2 space-y-1">
              {finding.sessionIds.map((id) => (
                <p key={id} className="truncate font-mono text-xs text-text-secondary">
                  {id}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function Analysis() {
  const [projects, setProjects] = useState<string[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [report, setReport] = useState<AnalysisReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/stats")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<DatabaseStats>;
      })
      .then((stats) => {
        const ids = stats.projectDistribution.map((p) => p.projectId);
        setProjects(ids);
        if (ids.length > 0) {
          setSelectedProject(ids[0]!);
        }
        setProjectsLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Unknown error");
        setProjectsLoading(false);
      });
  }, []);

  function handleAnalyze() {
    if (!selectedProject) return;

    setLoading(true);
    setError(null);
    setReport(null);

    fetch(`/api/analysis?project=${encodeURIComponent(selectedProject)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<AnalysisReport>;
      })
      .then((data) => {
        setReport(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Unknown error");
        setLoading(false);
      });
  }

  if (projectsLoading) {
    return (
      <div className="flex items-center justify-center p-6 text-text-secondary">Loading...</div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold text-text-primary">Workflow Analysis</h1>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="project-select" className="mb-1 block text-sm text-text-secondary">
            Project
          </label>
          <select
            id="project-select"
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="w-full rounded-lg border border-border bg-bg-surface px-4 py-2 text-text-primary outline-none focus:border-accent"
          >
            {projects.length === 0 && <option value="">No projects found</option>}
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={handleAnalyze}
          disabled={!selectedProject || loading}
          className="rounded-lg border border-accent bg-accent/20 px-6 py-2 text-sm font-medium text-accent hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {loading ? "Analyzing..." : "Analyze"}
        </button>
      </div>

      {error && <div className="mb-4 text-center text-red-400">Analysis failed: {error}</div>}

      {loading && <div className="py-8 text-center text-text-secondary">Running analysis...</div>}

      {!loading && report && (
        <div>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard title="Sessions Analyzed" value={report.analyzedSessions} />
            <SummaryCard title="Total Findings" value={report.summary.totalFindings} />
            <SummaryCard
              title="Critical"
              value={report.summary.bySeverity.critical}
              accent="text-red-300"
            />
            <SummaryCard
              title="Warnings"
              value={report.summary.bySeverity.warning}
              accent="text-amber-300"
            />
          </div>

          {report.findings.length === 0 ? (
            <div className="rounded-lg border border-border bg-bg-surface p-8 text-center">
              <p className="text-lg text-text-secondary">No issues found</p>
              <p className="mt-2 text-sm text-text-secondary">
                Your workflow looks good! No problematic patterns were detected.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {report.findings.map((finding, i) => (
                <FindingCard key={`${finding.pattern}-${i}`} finding={finding} />
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && !report && !error && (
        <div className="rounded-lg border border-border bg-bg-surface p-8 text-center">
          <p className="text-lg text-text-secondary">Select a project and click Analyze</p>
          <p className="mt-2 text-sm text-text-secondary">
            The analysis engine will scan session data for workflow patterns and suggest
            improvements.
          </p>
        </div>
      )}
    </div>
  );
}
