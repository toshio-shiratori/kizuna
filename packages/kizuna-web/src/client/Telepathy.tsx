import { useState, useEffect, useCallback } from "react";
import { ConfirmModal } from "./ConfirmModal";

interface TelepathyReference {
  name: string;
  dbPath: string;
}

interface TelepathyMessage {
  source: string;
  message: string;
  createdAt: string;
}

interface Report {
  id: number;
  type: string;
  source: string;
  title: string;
  content: string;
  status: string;
  createdAt: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function Telepathy() {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sendResult, setSendResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [messages, setMessages] = useState<TelepathyMessage[]>([]);
  const [receiving, setReceiving] = useState(false);
  const [receiveError, setReceiveError] = useState<string | null>(null);
  const [receiveNote, setReceiveNote] = useState<string | null>(null);

  const [references, setReferences] = useState<TelepathyReference[]>([]);
  const [refsLoading, setRefsLoading] = useState(true);

  const [reports, setReports] = useState<Report[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);

  useEffect(() => {
    fetch("/api/reports?limit=50")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ reports: Report[]; total: number }>;
      })
      .then((data) => {
        setReports(data.reports);
        setReportsLoading(false);
      })
      .catch(() => {
        setReportsLoading(false);
      });
  }, []);

  useEffect(() => {
    fetch("/api/telepathy/references")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ references: TelepathyReference[] }>;
      })
      .then((data) => {
        setReferences(data.references);
        setRefsLoading(false);
      })
      .catch(() => {
        setRefsLoading(false);
      });
  }, []);

  const fetchMessages = useCallback(() => {
    setReceiving(true);
    setReceiveError(null);
    setReceiveNote(null);

    fetch("/api/telepathy/receive")
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<{ messages: TelepathyMessage[]; note?: string }>;
      })
      .then((data) => {
        setMessages(data.messages);
        if (data.note) {
          setReceiveNote(data.note);
        }
        setReceiving(false);
      })
      .catch((err: unknown) => {
        setReceiveError(err instanceof Error ? err.message : "Unknown error");
        setReceiving(false);
      });
  }, []);

  useEffect(() => {
    fetchMessages();
  }, [fetchMessages]);

  function handleSendClick() {
    if (!message.trim()) return;
    setConfirmOpen(true);
  }

  function handleConfirmSend() {
    setConfirmOpen(false);
    setSending(true);
    setSendResult(null);

    fetch("/api/telepathy/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: message.trim() }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json()) as { error?: string };
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        return res.json() as Promise<{ ok: boolean; length: number }>;
      })
      .then((data) => {
        setSendResult({ ok: true, text: `Sent (${data.length} chars)` });
        setMessage("");
        setSending(false);
      })
      .catch((err: unknown) => {
        setSendResult({
          ok: false,
          text: err instanceof Error ? err.message : "Send failed",
        });
        setSending(false);
      });
  }

  return (
    <div className="p-6">
      <h1 className="mb-6 text-2xl font-bold text-text-primary">Telepathy</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Send Section */}
        <div className="rounded-lg border border-border bg-bg-surface p-5">
          <h2 className="mb-4 text-lg font-semibold text-text-primary">Send Message</h2>
          <p className="mb-3 text-sm text-text-secondary">
            Write a message to share with other projects. The message is stored locally and other
            projects read it via their references.
          </p>

          {!reportsLoading && reports.length > 0 && (
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Load from report
              </label>
              <select
                className="w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-text-primary outline-none focus:border-accent"
                defaultValue=""
                onChange={(e) => {
                  const report = reports.find((r) => r.id === Number(e.target.value));
                  if (report) {
                    setMessage(`[${report.title}]\n\n${report.content}`);
                  }
                  e.target.value = "";
                }}
              >
                <option value="" disabled>
                  Select a report...
                </option>
                {reports.map((r) => (
                  <option key={r.id} value={r.id}>
                    [{r.type}] {r.title}
                  </option>
                ))}
              </select>
            </div>
          )}

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Enter message to share..."
            rows={6}
            className="mb-3 w-full rounded-lg border border-border bg-bg px-4 py-2 text-sm text-text-primary placeholder-text-secondary outline-none focus:border-accent"
          />

          <div className="flex items-center gap-3">
            <button
              onClick={handleSendClick}
              disabled={sending || !message.trim()}
              className="rounded-lg border border-accent bg-accent/20 px-6 py-2 text-sm font-medium text-accent hover:bg-accent/30 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {sending ? "Sending..." : "Send"}
            </button>

            {sendResult && (
              <span className={`text-sm ${sendResult.ok ? "text-green-400" : "text-red-400"}`}>
                {sendResult.text}
              </span>
            )}
          </div>

          {!refsLoading && references.length > 0 && (
            <div className="mt-4 border-t border-border pt-3">
              <p className="mb-2 text-xs font-medium text-text-secondary">
                Discoverable projects ({references.length})
              </p>
              <div className="flex flex-wrap gap-2">
                {references.map((ref) => (
                  <span
                    key={ref.name}
                    className="rounded bg-bg px-2 py-1 text-xs text-text-secondary"
                    title={ref.dbPath}
                  >
                    {ref.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Receive Section */}
        <div className="rounded-lg border border-border bg-bg-surface p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-text-primary">Received Messages</h2>
            <button
              onClick={fetchMessages}
              disabled={receiving}
              className="rounded-lg border border-border px-3 py-1 text-sm text-text-secondary hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
            >
              {receiving ? "Loading..." : "Refresh"}
            </button>
          </div>

          {receiveError && (
            <div className="mb-3 text-sm text-red-400">Failed to load: {receiveError}</div>
          )}

          {receiveNote && messages.length === 0 && (
            <div className="rounded-lg border border-border bg-bg p-4 text-center text-sm text-text-secondary">
              {receiveNote}
            </div>
          )}

          {messages.length === 0 && !receiveNote && !receiveError && !receiving && (
            <div className="rounded-lg border border-border bg-bg p-4 text-center text-sm text-text-secondary">
              No messages from other projects
            </div>
          )}

          {messages.length > 0 && (
            <div className="space-y-3">
              {messages.map((msg) => (
                <div key={msg.source} className="rounded-lg border border-border bg-bg p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="rounded bg-accent/20 px-2 py-0.5 text-xs font-medium text-accent">
                      {msg.source}
                    </span>
                    <span className="text-xs text-text-secondary">{formatDate(msg.createdAt)}</span>
                  </div>
                  <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words text-sm text-text-primary">
                    {msg.message}
                  </pre>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Send Telepathy Message"
        confirmLabel="Send"
        cancelLabel="Cancel"
        onConfirm={handleConfirmSend}
        onCancel={() => setConfirmOpen(false)}
      >
        <p className="mb-3 text-sm text-text-secondary">
          Send this message ({message.trim().length} chars) via telepathy? Other projects will be
          able to read it.
        </p>
        <pre className="max-h-40 overflow-auto rounded-lg border border-border bg-bg p-3 text-sm text-text-primary whitespace-pre-wrap break-words">
          {message.trim()}
        </pre>
      </ConfirmModal>
    </div>
  );
}
