import type { Database } from "../storage/database.js";
import type { SearchQuery, SearchResult } from "../index.js";
import { preprocessQuery } from "./cjk-preprocessing.js";

export interface SearchOptions {
  halfLifeDays?: number;
}

function applyKeywordReranking(
  results: SearchResult[],
  originalQuery: string,
): SearchResult[] {
  if (results.length === 0) return results;

  const keywords = originalQuery
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2);

  if (keywords.length === 0) return results;

  return results
    .map((result) => {
      const contentLower = result.chunk.content.toLowerCase();
      let boost = 0;
      for (const keyword of keywords) {
        if (contentLower.includes(keyword.toLowerCase())) {
          boost += 0.1;
        }
      }
      return {
        ...result,
        score: result.score * (1 + boost),
      };
    })
    .sort((a, b) => b.score - a.score);
}

function buildFilteredQuery(
  db: Database,
  ftsQuery: string,
  query: SearchQuery,
  halfLifeDays: number,
): SearchResult[] {
  const conditions: string[] = ["chunks_fts MATCH ?"];
  const params: (string | number)[] = [halfLifeDays, ftsQuery];

  if (query.filters?.sessionIds && query.filters.sessionIds.length > 0) {
    const placeholders = query.filters.sessionIds.map(() => "?").join(",");
    conditions.push(`c.session_id IN (${placeholders})`);
    params.push(...query.filters.sessionIds);
  }

  if (query.filters?.projectIds && query.filters.projectIds.length > 0) {
    const placeholders = query.filters.projectIds.map(() => "?").join(",");
    conditions.push(
      `c.session_id IN (SELECT id FROM sessions WHERE project_id IN (${placeholders}))`,
    );
    params.push(...query.filters.projectIds);
  }

  if (query.filters?.minImportance !== undefined) {
    conditions.push("c.importance >= ?");
    params.push(query.filters.minImportance);
  }

  if (query.filters?.createdAfter) {
    conditions.push("c.created_at >= ?");
    params.push(query.filters.createdAfter);
  }

  if (query.filters?.createdBefore) {
    conditions.push("c.created_at <= ?");
    params.push(query.filters.createdBefore);
  }

  const whereClause = conditions.join(" AND ");
  params.push(halfLifeDays, query.limit);

  const sql = `SELECT
    c.*,
    bm25(chunks_fts) AS bm25_score,
    exp(-0.693 * (julianday('now') - julianday(c.created_at)) / ?) AS time_decay
  FROM chunks_fts
  JOIN chunks c ON chunks_fts.rowid = c.id
  WHERE ${whereClause}
  ORDER BY (bm25(chunks_fts) * exp(-0.693 * (julianday('now') - julianday(c.created_at)) / ?) * (1.0 + c.importance / 10.0)) DESC
  LIMIT ?`;

  interface FtsRow {
    id: number;
    session_id: string;
    turn_index: number;
    role: "user" | "assistant";
    content: string;
    token_count: number;
    importance: number;
    created_at: string;
    metadata: string;
    bm25_score: number;
    time_decay: number;
  }

  const rows = db.db.prepare(sql).all(...params) as FtsRow[];

  return rows.map((row) => ({
    chunk: {
      id: row.id,
      sessionId: row.session_id,
      turnIndex: row.turn_index,
      role: row.role,
      content: row.content,
      tokenCount: row.token_count,
      importance: row.importance,
      createdAt: row.created_at,
      metadata: JSON.parse(row.metadata) as Record<string, unknown>,
    },
    score:
      Math.abs(row.bm25_score) *
      row.time_decay *
      (1.0 + row.importance / 10.0),
  }));
}

export function searchMemory(
  db: Database,
  query: SearchQuery,
  options: SearchOptions = {},
): SearchResult[] {
  const halfLifeDays = options.halfLifeDays ?? 30;

  if (query.text.trim().length === 0) return [];

  const ftsQuery = preprocessQuery(query.text);
  if (ftsQuery.length === 0) return [];

  const hasFilters =
    query.filters &&
    (query.filters.sessionIds?.length ||
      query.filters.projectIds?.length ||
      query.filters.minImportance !== undefined ||
      query.filters.createdAfter ||
      query.filters.createdBefore);

  let results: SearchResult[];
  if (hasFilters) {
    results = buildFilteredQuery(db, ftsQuery, query, halfLifeDays);
  } else {
    results = db.searchChunks(ftsQuery, query.limit, halfLifeDays);
  }

  return applyKeywordReranking(results, query.text);
}
