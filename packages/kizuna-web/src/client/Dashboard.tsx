import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { DatabaseStats } from "@kizuna/core";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-bg-surface p-5">
      <h2 className="mb-2 text-sm font-medium text-text-secondary">{title}</h2>
      <div>{children}</div>
    </div>
  );
}

function ProjectBar({
  projectId,
  count,
  maxCount,
}: {
  projectId: string;
  count: number;
  maxCount: number;
}) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div className="mb-2 last:mb-0">
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="truncate text-text-primary" title={projectId}>
          {projectId}
        </span>
        <span className="ml-2 shrink-0 text-text-secondary">{count}</span>
      </div>
      <div className="h-2 w-full rounded-full bg-border">
        <div className="h-2 rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Dashboard() {
  const [stats, setStats] = useState<DatabaseStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    fetch("/api/stats")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<DatabaseStats>;
      })
      .then((data) => {
        setStats(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : "Unknown error");
        setLoading(false);
      });
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-6 text-text-secondary">
        {t("common.loading")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-6 text-red-400">
        {t("dashboard.failedToLoadStats", { error })}
      </div>
    );
  }

  if (!stats) return null;

  const maxProjectCount =
    stats.projectDistribution.length > 0 ? stats.projectDistribution[0].chunkCount : 0;

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold text-text-primary">{t("dashboard.title")}</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card title={t("dashboard.database")}>
          <p className="text-2xl font-semibold text-text-primary">
            {formatBytes(stats.databaseSizeBytes)}
          </p>
        </Card>

        <Card title={t("dashboard.sessions")}>
          <p className="text-2xl font-semibold text-text-primary">
            {stats.sessionCount.toLocaleString()}
          </p>
        </Card>

        <Card title={t("dashboard.chunks")}>
          <p className="text-2xl font-semibold text-text-primary">
            {stats.chunkCount.toLocaleString()}
          </p>
        </Card>

        <Card title={t("dashboard.dateRange")}>
          {stats.oldestChunkDate && stats.newestChunkDate ? (
            <p className="text-lg text-text-primary">
              {formatDate(stats.oldestChunkDate)}
              <span className="mx-2 text-text-secondary">-</span>
              {formatDate(stats.newestChunkDate)}
            </p>
          ) : (
            <p className="text-lg text-text-secondary">{t("common.noData")}</p>
          )}
        </Card>

        <Card title={t("dashboard.maintenance")}>
          <p className="text-lg text-text-primary">
            {stats.lastMaintenanceAt ? formatDate(stats.lastMaintenanceAt) : t("common.never")}
          </p>
        </Card>

        <Card title={t("dashboard.projects")}>
          {stats.projectDistribution.length > 0 ? (
            <div className="mt-1">
              {stats.projectDistribution.map((p) => (
                <ProjectBar
                  key={p.projectId}
                  projectId={p.projectId}
                  count={p.chunkCount}
                  maxCount={maxProjectCount}
                />
              ))}
            </div>
          ) : (
            <p className="text-lg text-text-secondary">{t("common.noData")}</p>
          )}
        </Card>
      </div>
    </div>
  );
}
