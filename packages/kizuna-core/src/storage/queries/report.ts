import type BetterSqlite3 from "better-sqlite3";
import type { Report } from "../../index.js";
import type { ReportRow } from "./types.js";
import { reportRowToReport } from "./types.js";

export function insertReport(
  db: BetterSqlite3.Database,
  params: {
    type: "analysis" | "proposal";
    source: "webui" | "claude";
    title: string;
    content: string;
  },
): Report {
  const result = db
    .prepare(
      `INSERT INTO reports (type, source, title, content)
       VALUES (?, ?, ?, ?)`,
    )
    .run(params.type, params.source, params.title, params.content);

  const row = db
    .prepare("SELECT * FROM reports WHERE id = ?")
    .get(Number(result.lastInsertRowid)) as ReportRow;

  return reportRowToReport(row);
}

export function getReport(db: BetterSqlite3.Database, id: number): Report | null {
  const row = db.prepare("SELECT * FROM reports WHERE id = ?").get(id) as ReportRow | undefined;
  return row ? reportRowToReport(row) : null;
}

export function listReports(
  db: BetterSqlite3.Database,
  opts?: {
    status?: string;
    type?: string;
    source?: string;
    limit?: number;
    offset?: number;
  },
): { reports: Report[]; total: number } {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (opts?.status) {
    conditions.push("status = ?");
    params.push(opts.status);
  }
  if (opts?.type) {
    conditions.push("type = ?");
    params.push(opts.type);
  }
  if (opts?.source) {
    conditions.push("source = ?");
    params.push(opts.source);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const totalRow = db
    .prepare(`SELECT COUNT(*) AS cnt FROM reports ${whereClause}`)
    .get(...params) as { cnt: number };
  const total = totalRow.cnt;

  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const rows = db
    .prepare(`SELECT * FROM reports ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limit, offset) as ReportRow[];

  return { reports: rows.map(reportRowToReport), total };
}

export function updateReportStatus(
  db: BetterSqlite3.Database,
  id: number,
  status: "unread" | "read",
): boolean {
  const result = db.prepare("UPDATE reports SET status = ? WHERE id = ?").run(status, id);
  return result.changes > 0;
}

export function deleteReport(db: BetterSqlite3.Database, id: number): boolean {
  const result = db.prepare("DELETE FROM reports WHERE id = ?").run(id);
  return result.changes > 0;
}
