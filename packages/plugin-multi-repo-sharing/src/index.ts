import BetterSqlite3 from "better-sqlite3";
import { preprocessQuery } from "@kizuna/core";
import type {
  Plugin,
  SearchQuery,
  SearchResult,
  StoredChunk,
  PluginContext,
  Migration,
  PreprocessedQuery,
} from "@kizuna/core";

export interface RepoReference {
  name: string;
  dbPath: string;
}

export interface MultiRepoSharingOptions {
  references?: RepoReference[];
  halfLifeDays?: number;
}

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

const PLUGIN_NAME = "@kizuna/plugin-multi-repo-sharing";
const DEFAULT_HALF_LIFE_DAYS = 30;
const MAX_RECOMMENDED_REFERENCES = 5;

/**
 * Normalize scores within a result set to [0, 1] using min-max normalization.
 * If all scores are identical, all are normalized to 1.0.
 */
export function normalizeScores(results: SearchResult[]): SearchResult[] {
  if (results.length === 0) return results;

  let min = Infinity;
  let max = -Infinity;
  for (const r of results) {
    if (r.score < min) min = r.score;
    if (r.score > max) max = r.score;
  }

  const range = max - min;
  if (range === 0) {
    return results.map((r) => ({ ...r, score: 1.0 }));
  }

  return results.map((r) => ({
    ...r,
    score: (r.score - min) / range,
  }));
}

function rowToStoredChunk(row: FtsRow): StoredChunk {
  return {
    id: row.id,
    sessionId: row.session_id,
    turnIndex: row.turn_index,
    role: row.role,
    content: row.content,
    tokenCount: row.token_count,
    importance: row.importance,
    createdAt: row.created_at,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
  };
}

/**
 * Query a read-only database for FTS5 search results.
 * The query is executed against the chunks_fts index using the same scoring
 * formula as the core search pipeline (BM25 * time_decay * importance_boost).
 *
 * When likePatterns are provided, they are added as AND conditions to narrow
 * results (used for short CJK tokens that cannot be matched via FTS5 trigram).
 */
export function queryRemoteDb(
  db: BetterSqlite3.Database,
  ftsQuery: string,
  limit: number,
  halfLifeDays: number,
  likePatterns: string[] = [],
): SearchResult[] {
  if (ftsQuery.length === 0 && likePatterns.length === 0) return [];

  if (ftsQuery.length === 0) {
    // LIKE-only mode
    const likeConditions = likePatterns.map(() => "c.content LIKE ? ESCAPE '\\'").join(" AND ");
    const params: (string | number)[] = [halfLifeDays, ...likePatterns, halfLifeDays, limit];
    const sql = `SELECT
         c.*,
         1.0 AS bm25_score,
         exp(-0.693 * (julianday('now') - julianday(c.created_at)) / ?) AS time_decay
       FROM chunks_fts
       JOIN chunks c ON chunks_fts.rowid = c.id
       WHERE ${likeConditions}
       ORDER BY (exp(-0.693 * (julianday('now') - julianday(c.created_at)) / ?) * (1.0 + c.importance / 10.0)) DESC
       LIMIT ?`;
    const rows = db.prepare(sql).all(...params) as FtsRow[];
    return rows.map((row) => ({
      chunk: rowToStoredChunk(row),
      score: row.bm25_score * row.time_decay * (1.0 + row.importance / 10.0),
    }));
  }

  // FTS5 MATCH mode (optionally combined with LIKE)
  const conditions: string[] = ["chunks_fts MATCH ?"];
  const params: (string | number)[] = [halfLifeDays, ftsQuery];
  for (const pattern of likePatterns) {
    conditions.push("c.content LIKE ? ESCAPE '\\'");
    params.push(pattern);
  }
  const whereClause = conditions.join(" AND ");
  params.push(halfLifeDays, limit);

  const sql = `SELECT
       c.*,
       bm25(chunks_fts) AS bm25_score,
       exp(-0.693 * (julianday('now') - julianday(c.created_at)) / ?) AS time_decay
     FROM chunks_fts
     JOIN chunks c ON chunks_fts.rowid = c.id
     WHERE ${whereClause}
     ORDER BY (bm25(chunks_fts) * exp(-0.693 * (julianday('now') - julianday(c.created_at)) / ?) * (1.0 + c.importance / 10.0)) DESC
     LIMIT ?`;

  const rows = db.prepare(sql).all(...params) as FtsRow[];

  return rows.map((row) => ({
    chunk: rowToStoredChunk(row),
    score: Math.abs(row.bm25_score) * row.time_decay * (1.0 + row.importance / 10.0),
  }));
}

/**
 * Check if a database file has the expected FTS5 schema for chunk search.
 */
export function hasCompatibleSchema(db: BetterSqlite3.Database): boolean {
  try {
    const row = db
      .prepare(
        `SELECT count(*) AS cnt FROM sqlite_master
         WHERE type = 'table' AND name = 'chunks_fts'`,
      )
      .get() as { cnt: number };
    return row.cnt > 0;
  } catch {
    return false;
  }
}

/**
 * Query referenced databases and return annotated, normalized results.
 *
 * Opens each referenced database in read-only mode, executes the FTS5 query,
 * and annotates results with the reference name as source.
 * Databases that are inaccessible or have incompatible schemas are skipped
 * with a warning log.
 */
export function queryReferences(
  references: RepoReference[],
  ftsQuery: string,
  limit: number,
  halfLifeDays: number,
  logger: PluginContext["logger"],
  likePatterns: string[] = [],
): SearchResult[] {
  const allResults: SearchResult[] = [];

  for (const ref of references) {
    try {
      const remoteDb = new BetterSqlite3(ref.dbPath, { readonly: true });
      try {
        if (!hasCompatibleSchema(remoteDb)) {
          logger.warn(`Skipping reference "${ref.name}": incompatible schema at ${ref.dbPath}`);
          continue;
        }
        const remoteResults = queryRemoteDb(remoteDb, ftsQuery, limit, halfLifeDays, likePatterns);
        // Normalize remote results independently per database
        const normalized = normalizeScores(remoteResults);
        for (const r of normalized) {
          allResults.push({
            ...r,
            annotations: {
              ...r.annotations,
              source: ref.name,
            },
          });
        }
      } finally {
        remoteDb.close();
      }
    } catch (err) {
      logger.warn(
        `Skipping reference "${ref.name}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  return allResults;
}

/**
 * Create the multi-repo-sharing plugin instance.
 *
 * Uses a factory function to maintain closure-scoped state for passing the
 * search query from beforeSearch to afterSearch. The plugin uses:
 *
 * - beforeSearch: captures query text and limit for federated fan-out
 * - afterSearch: queries referenced databases, normalizes scores, and merges
 *
 * No beforeCapture hook is needed (no namespace metadata tagging).
 */
export function createMultiRepoSharing(): Plugin {
  // Closure-scoped state to pass query from beforeSearch to afterSearch.
  // This is safe because search operations are sequential in Kizuna's
  // hook-based architecture (UserPromptSubmit runs synchronously per prompt).
  let lastQueryText: string | null = null;
  let lastQueryLimit: number = 10;

  return {
    name: PLUGIN_NAME,
    version: "0.1.0",
    description: "Enables cross-repository memory search via federated queries",

    migrations(): Migration[] {
      // Keep the existing migration for backward compatibility with databases
      // that already have the index. No new migrations are needed for the
      // federated search approach.
      return [
        {
          version: 1,
          description: "Add index for namespace queries (legacy, kept for compatibility)",
          up: `
            CREATE INDEX IF NOT EXISTS idx_chunks_metadata_namespace
              ON chunks(json_extract(metadata, '$."${PLUGIN_NAME}".namespace'));
          `,
          down: `DROP INDEX IF EXISTS idx_chunks_metadata_namespace;`,
        },
      ];
    },

    beforeSearch(query: SearchQuery): SearchQuery {
      // Capture query text for use in afterSearch.
      // We store the raw text; FTS preprocessing is done in afterSearch
      // using the same preprocessQuery function as the core pipeline.
      lastQueryText = query.text;
      lastQueryLimit = query.limit;
      return query;
    },

    afterSearch(results: SearchResult[], ctx: PluginContext): SearchResult[] {
      // Capture and clear query state immediately for defensive correctness
      const queryText = lastQueryText;
      const queryLimit = lastQueryLimit;
      lastQueryText = null;

      const options = ctx.config.options as MultiRepoSharingOptions;
      const references = options.references;
      if (!references || references.length === 0) {
        return results;
      }

      if (references.length > MAX_RECOMMENDED_REFERENCES) {
        ctx.logger.warn(
          `${references.length} references configured (recommended max: ${MAX_RECOMMENDED_REFERENCES}). Search latency may increase.`,
        );
      }

      // Annotate local results with source information
      const annotatedLocal = results.map((r) => ({
        ...r,
        annotations: {
          ...r.annotations,
          source: "local",
        },
      }));

      if (!queryText) {
        return annotatedLocal;
      }

      // Preprocess the query for FTS5 (CJK n-gram support)
      const { ftsQuery, likePatterns }: PreprocessedQuery = preprocessQuery(queryText);
      if (ftsQuery.length === 0 && likePatterns.length === 0) {
        return annotatedLocal;
      }

      // Query referenced databases
      const halfLifeDays = options.halfLifeDays ?? DEFAULT_HALF_LIFE_DAYS;
      const remoteResults = queryReferences(
        references,
        ftsQuery,
        queryLimit,
        halfLifeDays,
        ctx.logger,
        likePatterns,
      );

      if (remoteResults.length === 0) {
        return annotatedLocal;
      }

      // Normalize local results independently
      const normalizedLocal = normalizeScores(annotatedLocal);

      // Merge normalized local and remote results, sort by score descending
      const merged = [...normalizedLocal, ...remoteResults];
      merged.sort((a, b) => b.score - a.score);

      return merged.slice(0, queryLimit);
    },
  };
}

/**
 * Pre-configured plugin instance for backward compatibility.
 * For new code, prefer createMultiRepoSharing() which returns a fresh instance.
 */
export const multiRepoSharing: Plugin = createMultiRepoSharing();
