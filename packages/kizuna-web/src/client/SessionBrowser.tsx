import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { PaginatedResult, SessionListItem, Session, StoredChunk } from "@kizuna/core";
import { ConfirmModal } from "./ConfirmModal.js";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function RoleBadge({ role }: { role: "user" | "assistant" }) {
  const cls =
    role === "user"
      ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
      : "bg-green-500/20 text-green-300 border-green-500/30";
  return (
    <span className={`inline-block rounded border px-2 py-0.5 text-xs font-medium ${cls}`}>
      {role}
    </span>
  );
}

function ChunkCard({
  chunk,
  writeMode,
  onImportanceChange,
  onDelete,
}: {
  chunk: StoredChunk;
  writeMode: boolean;
  onImportanceChange?: (id: number, importance: number) => void;
  onDelete?: (id: number) => void;
}) {
  const [localImportance, setLocalImportance] = useState(chunk.importance);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { t } = useTranslation();

  const isDirty = localImportance !== chunk.importance;

  const handleSave = useCallback(async () => {
    if (!isDirty || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/chunks/${chunk.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ importance: localImportance }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        throw new Error(err.error);
      }
      onImportanceChange?.(chunk.id, localImportance);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("common.unknownError");
      alert(t("sessionBrowser.failedToUpdateImportance", { error: msg }));
      setLocalImportance(chunk.importance);
    } finally {
      setSaving(false);
    }
  }, [chunk.id, chunk.importance, localImportance, isDirty, saving, onImportanceChange]);

  const handleDelete = useCallback(() => {
    setConfirmOpen(true);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    setConfirmOpen(false);
    setDeleting(true);
    try {
      const res = await fetch(`/api/chunks/${chunk.id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = (await res.json()) as { error: string };
        throw new Error(err.error);
      }
      onDelete?.(chunk.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("common.unknownError");
      alert(t("sessionBrowser.failedToDeleteChunk", { error: msg }));
      setDeleting(false);
    }
  }, [chunk.id, onDelete]);

  return (
    <div className="rounded-lg border border-border bg-bg p-4">
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-text-secondary">
        <RoleBadge role={chunk.role} />
        <span>{t("sessionBrowser.importance", { value: chunk.importance })}</span>
        <span>{t("sessionBrowser.tokens", { value: chunk.tokenCount })}</span>
        <span>{formatDate(chunk.createdAt)}</span>
      </div>
      <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm text-text-primary">
        {chunk.content}
      </pre>
      {writeMode && (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-border pt-3">
          <label className="flex items-center gap-2 text-xs text-text-secondary">
            <span>{t("sessionBrowser.importanceLabel")}</span>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={localImportance}
              onChange={(e) => setLocalImportance(Number(e.target.value))}
              className="h-1.5 w-24 cursor-pointer accent-accent"
            />
            <span className="w-5 text-center font-mono text-text-primary">{localImportance}</span>
          </label>
          <button
            onClick={handleSave}
            disabled={!isDirty || saving}
            className="rounded border border-accent/30 px-3 py-1 text-xs text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? t("sessionBrowser.saving") : t("common.save")}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="ml-auto rounded border border-red-500/30 px-3 py-1 text-xs text-red-400 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {deleting ? t("sessionBrowser.deleting") : t("common.delete")}
          </button>
        </div>
      )}

      <ConfirmModal
        open={confirmOpen}
        title={t("sessionBrowser.deleteChunk")}
        confirmLabel={t("common.delete")}
        onConfirm={handleConfirmDelete}
        onCancel={() => setConfirmOpen(false)}
      >
        <p className="mb-3 text-sm text-text-secondary">{t("sessionBrowser.deleteConfirmation")}</p>
        <div className="rounded-lg border border-border bg-bg p-3 text-sm">
          <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-text-secondary">
            <span>{t("sessionBrowser.id", { id: chunk.id })}</span>
            <RoleBadge role={chunk.role} />
            <span>{t("sessionBrowser.turn", { index: chunk.turnIndex })}</span>
          </div>
          <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words text-text-primary">
            {chunk.content}
          </pre>
        </div>
      </ConfirmModal>
    </div>
  );
}

function SessionDetail({
  sessionId,
  writeMode,
  onClose,
}: {
  sessionId: string;
  writeMode: boolean;
  onClose: () => void;
}) {
  const [data, setData] = useState<{ session: Session; chunks: StoredChunk[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/sessions/${encodeURIComponent(sessionId)}/chunks`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ session: Session; chunks: StoredChunk[] }>;
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t("common.unknownError"));
        setLoading(false);
      });
  }, [sessionId]);

  const handleImportanceChange = useCallback(
    (id: number, importance: number) => {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          chunks: prev.chunks.map((c) => (c.id === id ? { ...c, importance } : c)),
        };
      });
    },
    [setData],
  );

  const handleDelete = useCallback(
    (id: number) => {
      setData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          chunks: prev.chunks.filter((c) => c.id !== id),
        };
      });
    },
    [setData],
  );

  if (loading) {
    return (
      <div className="py-4 text-center text-text-secondary">
        {t("sessionBrowser.loadingChunks")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-4 text-center text-red-400">
        {t("sessionBrowser.failedToLoadChunks", { error })}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="mt-4 rounded-lg border border-accent/30 bg-bg-surface p-4">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-text-primary">
            {t("sessionBrowser.sessionDetail")}
          </h3>
          <p className="text-xs text-text-secondary">
            {data.session.projectId} | {formatDate(data.session.startedAt)}
            {data.session.endedAt ? ` - ${formatDate(data.session.endedAt)}` : ""}
          </p>
          <p className="mt-1 font-mono text-xs text-text-secondary">{data.session.id}</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={`/api/export/session/${encodeURIComponent(sessionId)}?format=json`}
            className="rounded border border-border px-3 py-1 text-sm text-text-secondary hover:bg-border hover:text-text-primary"
            download
          >
            {t("common.exportJson")}
          </a>
          <a
            href={`/api/export/session/${encodeURIComponent(sessionId)}?format=markdown`}
            className="rounded border border-border px-3 py-1 text-sm text-text-secondary hover:bg-border hover:text-text-primary"
            download
          >
            {t("common.exportMd")}
          </a>
          <button
            onClick={onClose}
            className="rounded border border-border px-3 py-1 text-sm text-text-secondary hover:bg-border hover:text-text-primary"
          >
            {t("common.close")}
          </button>
        </div>
      </div>
      <div className="space-y-3">
        {data.chunks.map((chunk) => (
          <ChunkCard
            key={chunk.id}
            chunk={chunk}
            writeMode={writeMode}
            onImportanceChange={handleImportanceChange}
            onDelete={handleDelete}
          />
        ))}
      </div>
    </div>
  );
}

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  const { t } = useTranslation();

  if (totalPages <= 1) return null;

  const pages: number[] = [];
  const start = Math.max(1, page - 2);
  const end = Math.min(totalPages, page + 2);
  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  return (
    <div className="mt-4 flex items-center justify-center gap-2">
      <button
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
        className="rounded border border-border px-3 py-1 text-sm text-text-secondary hover:bg-border hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t("sessionBrowser.prev")}
      </button>
      {start > 1 && <span className="text-sm text-text-secondary">...</span>}
      {pages.map((p) => (
        <button
          key={p}
          onClick={() => onPageChange(p)}
          className={`rounded border px-3 py-1 text-sm ${
            p === page
              ? "border-accent bg-accent/20 text-accent"
              : "border-border text-text-secondary hover:bg-border hover:text-text-primary"
          }`}
        >
          {p}
        </button>
      ))}
      {end < totalPages && <span className="text-sm text-text-secondary">...</span>}
      <button
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
        className="rounded border border-border px-3 py-1 text-sm text-text-secondary hover:bg-border hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
      >
        {t("sessionBrowser.next")}
      </button>
    </div>
  );
}

export function SessionBrowser() {
  const [result, setResult] = useState<PaginatedResult<SessionListItem> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [writeMode, setWriteMode] = useState(false);
  const limit = 20;
  const { t } = useTranslation();

  useEffect(() => {
    fetch("/api/config")
      .then(async (res) => {
        if (!res.ok) return;
        const cfg = (await res.json()) as { write: boolean };
        setWriteMode(cfg.write);
      })
      .catch(() => {
        /* ignore - default to read-only */
      });
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setSelectedSession(null);
    fetch(`/api/sessions?page=${page}&limit=${limit}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<PaginatedResult<SessionListItem>>;
      })
      .then((data) => {
        setResult(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        setError(err instanceof Error ? err.message : t("common.unknownError"));
        setLoading(false);
      });
  }, [page]);

  if (loading) {
    return (
      <div className="p-6 text-center text-text-secondary">
        {t("sessionBrowser.loadingSessions")}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 text-center text-red-400">
        {t("sessionBrowser.failedToLoadSessions", { error })}
      </div>
    );
  }

  if (!result) return null;

  if (result.items.length === 0) {
    return (
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-bold text-text-primary">{t("sessionBrowser.title")}</h1>
        <div className="rounded-lg border border-border bg-bg-surface p-8 text-center">
          <p className="text-lg text-text-secondary">{t("sessionBrowser.noSessionsFound")}</p>
          <p className="mt-2 text-sm text-text-secondary">
            {t("sessionBrowser.noSessionsDescription")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-text-primary">{t("sessionBrowser.title")}</h1>
        <span className="text-sm text-text-secondary">
          {t("sessionBrowser.sessionCount", { count: result.total })}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-border text-left text-sm text-text-secondary">
              <th className="px-4 py-2 font-medium">{t("sessionBrowser.date")}</th>
              <th className="px-4 py-2 font-medium">{t("sessionBrowser.project")}</th>
              <th className="px-4 py-2 font-medium">{t("sessionBrowser.chunks")}</th>
              <th className="px-4 py-2 font-medium">{t("sessionBrowser.preview")}</th>
            </tr>
          </thead>
          <tbody>
            {result.items.map((session) => (
              <tr
                key={session.sessionId}
                onClick={() =>
                  setSelectedSession(
                    selectedSession === session.sessionId ? null : session.sessionId,
                  )
                }
                className={`cursor-pointer border-b border-border transition-colors hover:bg-bg-surface ${
                  selectedSession === session.sessionId ? "bg-bg-surface" : ""
                }`}
              >
                <td className="whitespace-nowrap px-4 py-3 text-sm text-text-primary">
                  {formatDate(session.startedAt)}
                </td>
                <td className="px-4 py-3 text-sm text-accent">{session.projectId}</td>
                <td className="px-4 py-3 text-sm text-text-secondary">{session.chunkCount}</td>
                <td className="max-w-md truncate px-4 py-3 text-sm text-text-secondary">
                  {session.preview}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination page={result.page} totalPages={result.totalPages} onPageChange={setPage} />

      {selectedSession && (
        <SessionDetail
          sessionId={selectedSession}
          writeMode={writeMode}
          onClose={() => setSelectedSession(null)}
        />
      )}
    </div>
  );
}
