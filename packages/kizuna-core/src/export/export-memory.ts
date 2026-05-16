import type { Database } from "../storage/database.js";
import type { StoredChunk } from "../index.js";
import { searchMemory } from "../pipelines/search.js";
import type { ExportData, ExportFormat, ExportFilters } from "./formatter.js";
import { formatExport } from "./formatter.js";
import { resolveDateInput } from "./relative-date.js";
import type { ChunkRow } from "../storage/queries/types.js";
import { chunkRowToStoredChunk } from "../storage/queries/types.js";

export interface ExportOptions {
  /** Start of time range (ISO 8601 or relative like "7d", "1w", "1m") */
  since?: string;
  /** End of time range (ISO 8601 or relative) */
  until?: string;
  /** FTS5 search query */
  query?: string;
  /** Maximum number of chunks (default: 100) */
  limit?: number;
  /** Output format (default: "markdown") */
  format?: ExportFormat;
  /** Project ID (resolved from config) */
  projectId?: string;
  /** Reference time for relative date resolution (default: now) */
  now?: Date;
  /** Filter by chunk role */
  role?: "user" | "assistant";
  /** Minimum importance threshold (0-10) */
  minImportance?: number;
  /** Filter by session IDs */
  sessionIds?: string[];
  /** Omit metadata from output */
  noMetadata?: boolean;
  /** Cross-project reference name (for metadata) */
  project?: string;
}

const DEFAULT_LIMIT = 100;

/**
 * Export memory chunks with formatting.
 *
 * When `query` is specified, uses the search pipeline (BM25 + time decay).
 * When `query` is omitted, retrieves chunks in reverse chronological order.
 */
export async function exportMemory(db: Database, options: ExportOptions = {}): Promise<string> {
  const now = options.now ?? new Date();
  const format = options.format ?? "markdown";
  const limit = options.limit ?? DEFAULT_LIMIT;
  const projectId = options.projectId ?? "unknown";

  // Resolve date filters
  const resolvedSince = options.since ? resolveDateInput(options.since, now) : undefined;
  const resolvedUntil = options.until ? resolveDateInput(options.until, now) : undefined;

  // Fetch chunks
  let chunks: StoredChunk[];

  if (options.query) {
    // Use search pipeline for query-based export
    const results = await searchMemory(db, {
      text: options.query,
      limit,
      filters: {
        createdAfter: resolvedSince,
        createdBefore: resolvedUntil,
        sessionIds: options.sessionIds,
        minImportance: options.minImportance,
      },
    });
    chunks = results.map((r) => r.chunk);

    // Post-query filter: role (not supported by SearchFilters)
    if (options.role) {
      chunks = chunks.filter((c) => c.role === options.role);
    }
  } else {
    // Chronological retrieval (newest first)
    chunks = listChunksChronological(db, {
      since: resolvedSince,
      until: resolvedUntil,
      limit,
      role: options.role,
      minImportance: options.minImportance,
      sessionIds: options.sessionIds,
    });
  }

  // Build export data
  const noMetadata = options.noMetadata ?? false;
  const exportData = buildExportData(chunks, {
    projectId,
    now,
    filters: {
      since: options.since,
      until: options.until,
      query: options.query,
      limit,
      role: options.role,
      minImportance: options.minImportance,
      session: options.sessionIds,
      project: options.project,
    },
  });

  return formatExport(exportData, format, { noMetadata });
}

interface ListOptions {
  since?: string;
  until?: string;
  limit: number;
  role?: "user" | "assistant";
  minImportance?: number;
  sessionIds?: string[];
}

function listChunksChronological(db: Database, options: ListOptions): StoredChunk[] {
  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (options.since) {
    conditions.push("created_at >= ?");
    params.push(options.since);
  }
  if (options.until) {
    conditions.push("created_at <= ?");
    params.push(options.until);
  }
  if (options.role) {
    conditions.push("role = ?");
    params.push(options.role);
  }
  if (options.minImportance !== undefined) {
    conditions.push("importance >= ?");
    params.push(options.minImportance);
  }
  if (options.sessionIds && options.sessionIds.length > 0) {
    const placeholders = options.sessionIds.map(() => "?").join(",");
    conditions.push(`session_id IN (${placeholders})`);
    params.push(...options.sessionIds);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  params.push(options.limit);

  const sql = `SELECT * FROM chunks ${whereClause} ORDER BY created_at DESC LIMIT ?`;

  const rows = db.db.prepare(sql).all(...params) as ChunkRow[];

  return rows.map(chunkRowToStoredChunk);
}

interface BuildExportDataOptions {
  projectId: string;
  now: Date;
  filters: ExportFilters;
}

function buildExportData(chunks: StoredChunk[], options: BuildExportDataOptions): ExportData {
  let dateRange: { from: string; to: string } | null = null;
  if (chunks.length > 0) {
    let oldest = chunks[0]!.createdAt;
    let newest = chunks[0]!.createdAt;
    for (const chunk of chunks) {
      if (chunk.createdAt < oldest) oldest = chunk.createdAt;
      if (chunk.createdAt > newest) newest = chunk.createdAt;
    }
    dateRange = { from: oldest, to: newest };
  }

  return {
    meta: {
      projectId: options.projectId,
      exportedAt: options.now.toISOString(),
      chunkCount: chunks.length,
      dateRange,
      filters: options.filters,
    },
    chunks,
  };
}
