import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import type { DatabaseStats } from "@kizuna/core";

type Severity = "info" | "warning" | "critical";

interface Finding {
  pattern: string;
  severity: Severity;
  descriptionKey: string;
  descriptionParams: Record<string, string | number>;
  sessionIds: string[];
  suggestionKey: string;
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

function SeverityBadge({ severity }: { severity: Severity }) {
  const { t } = useTranslation();

  const severityKeyMap: Record<Severity, string> = {
    critical: "analysis.severityCritical",
    warning: "analysis.severityWarning",
    info: "analysis.severityInfo",
  };

  return (
    <span
      className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${severityStyles[severity]}`}
    >
      {t(severityKeyMap[severity])}
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
  const { t } = useTranslation();

  return (
    <div className="rounded-lg border border-border bg-bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <SeverityBadge severity={finding.severity} />
        <span className="rounded bg-bg px-2 py-0.5 text-xs text-text-secondary">
          {t(`analysis.patternLabels.${finding.pattern}`)}
        </span>
        <span className="text-xs text-text-secondary">
          {t("analysis.findingSummary", {
            occurrences: finding.count,
            count: finding.sessionIds.length,
          })}
        </span>
      </div>

      <p className="mb-3 text-sm text-text-primary">
        {t(finding.descriptionKey, finding.descriptionParams)}
      </p>

      <div className="rounded border border-accent/20 bg-accent/5 p-3">
        <p className="text-xs font-medium text-accent">{t("analysis.suggestion")}</p>
        <p className="mt-1 text-sm text-text-secondary">{t(finding.suggestionKey)}</p>
      </div>

      {finding.sessionIds.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-text-secondary hover:text-text-primary"
          >
            {expanded
              ? t("analysis.hideAffectedSessions", { count: finding.sessionIds.length })
              : t("analysis.showAffectedSessions", { count: finding.sessionIds.length })}
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
  const { t } = useTranslation();

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
        setError(err instanceof Error ? err.message : t("common.unknownError"));
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
        setError(err instanceof Error ? err.message : t("common.unknownError"));
        setLoading(false);
      });
  }

  if (projectsLoading) {
    return (
      <div className="flex items-center justify-center p-6 text-text-secondary">
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold text-text-primary">{t("analysis.title")}</h1>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="project-select" className="mb-1 block text-sm text-text-secondary">
            {t("analysis.project")}
          </label>
          <select
            id="project-select"
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="w-full rounded-lg border border-border bg-bg-surface px-4 py-2 text-text-primary outline-none focus:border-accent"
          >
            {projects.length === 0 && <option value="">{t("analysis.noProjects")}</option>}
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
          {loading ? t("analysis.analyzing") : t("analysis.analyze")}
        </button>
      </div>

      {error && (
        <div className="mb-4 text-center text-red-400">
          {t("analysis.analysisFailed", { error })}
        </div>
      )}

      {loading && (
        <div className="py-8 text-center text-text-secondary">{t("analysis.runningAnalysis")}</div>
      )}

      {!loading && report && (
        <div>
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard title={t("analysis.sessionsAnalyzed")} value={report.analyzedSessions} />
            <SummaryCard title={t("analysis.totalFindings")} value={report.summary.totalFindings} />
            <SummaryCard
              title={t("analysis.critical")}
              value={report.summary.bySeverity.critical}
              accent="text-red-300"
            />
            <SummaryCard
              title={t("analysis.warnings")}
              value={report.summary.bySeverity.warning}
              accent="text-amber-300"
            />
          </div>

          {report.findings.length === 0 ? (
            <div className="rounded-lg border border-border bg-bg-surface p-8 text-center">
              <p className="text-lg text-text-secondary">{t("analysis.noIssues")}</p>
              <p className="mt-2 text-sm text-text-secondary">
                {t("analysis.noIssuesDescription")}
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
          <p className="text-lg text-text-secondary">{t("analysis.initialPrompt")}</p>
          <p className="mt-2 text-sm text-text-secondary">{t("analysis.initialDescription")}</p>
        </div>
      )}
    </div>
  );
}
