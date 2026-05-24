export type { KizunaConfig, PipelineConfig, DisplayConfig } from "./config/index.js";
export { DEFAULT_CONFIG, PIPELINE_DEFAULTS, DISPLAY_DEFAULTS, loadConfig } from "./config/index.js";
export { Database } from "./storage/database.js";
export type { DatabaseOptions } from "./storage/database.js";
export type { DatabaseStats } from "./storage/queries/maintenance.js";
export { PluginManager } from "./plugin/index.js";
export type { PluginManagerOptions, PluginEntry } from "./plugin/index.js";
export { SqlitePluginStorage } from "./plugin/index.js";
export { runPluginMigrations } from "./plugin/index.js";
export {
  loadPluginManager,
  readPluginsConfig,
  importPlugin,
  resolvePluginFromModule,
} from "./plugin/index.js";
export type {
  PluginsFileConfig,
  PluginEntryConfig,
  LoadPluginManagerOptions,
} from "./plugin/index.js";
export { captureTranscript } from "./pipelines/capture.js";
export type { CaptureResult, CaptureOptions } from "./pipelines/capture.js";
export {
  parseTranscriptFile,
  parseTranscriptContent,
  sanitizeContent,
} from "./pipelines/transcript-parser.js";
export type { ParsedTurn } from "./pipelines/transcript-parser.js";
export {
  chunkifyTurns,
  isLowQualityContent,
  truncateChunk,
  MIN_CONTENT_LENGTH,
} from "./pipelines/chunker.js";
export { searchMemory } from "./pipelines/search.js";
export type { SearchOptions } from "./pipelines/search.js";
export { preprocessQuery, isCJKChar, splitByCJK } from "./pipelines/cjk-preprocessing.js";
export type { PreprocessedQuery } from "./pipelines/cjk-preprocessing.js";
export { injectMemory, formatContext } from "./pipelines/inject.js";
export type { InjectOptions, InjectResult } from "./pipelines/inject.js";
export { estimateTokens } from "./pipelines/chunker.js";
export { runMaintenance } from "./pipelines/maintenance.js";
export type { MaintenanceOptions } from "./pipelines/maintenance.js";
export {
  findLowQualityChunks,
  findChunksByQuery,
  executeCleanup,
  cleanupChunks,
} from "./pipelines/cleanup.js";
export type { CleanupResult, CleanupTarget } from "./pipelines/cleanup.js";
export { exportMemory } from "./export/index.js";
export type {
  ExportOptions,
  ExportFormat,
  ExportFilters,
  ExportMeta,
  ExportData,
  FormatOptions,
} from "./export/index.js";
export { parseRelativeDate, isRelativeDate, resolveDateInput } from "./export/index.js";
export { formatMarkdown, formatJson, formatExport } from "./export/index.js";

// ─── Storage Types ────────────────────────────────────────

export interface Session {
  id: string;
  projectId: string;
  startedAt: string;
  endedAt: string | null;
  transcriptPath: string | null;
  metadata: Record<string, unknown>;
}

export interface SessionPreview {
  sessionId: string;
  startedAt: string;
  projectId: string;
  preview: string;
}

export interface SessionListItem {
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
  projectId: string;
  chunkCount: number;
  preview: string;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Chunk Types ──────────────────────────────────────────

export interface RawChunk {
  sessionId: string;
  turnIndex: number;
  role: "user" | "assistant";
  content: string;
  metadata: Record<string, unknown>;
}

export interface StoredChunk extends RawChunk {
  id: number;
  tokenCount: number;
  importance: number;
  createdAt: string;
}

// ─── Search Types ─────────────────────────────────────────

export interface SearchQuery {
  text: string;
  limit: number;
  filters?: SearchFilters;
  extensions?: Record<string, unknown>;
}

export interface SearchFilters {
  sessionIds?: string[];
  projectIds?: string[];
  namespaces?: string[];
  minImportance?: number;
  createdAfter?: string;
  createdBefore?: string;
}

export interface SearchResult {
  chunk: StoredChunk;
  score: number;
  annotations?: Record<string, unknown>;
}

// ─── Inject Types ─────────────────────────────────────────

export interface ContextInjection {
  readonly userPrompt: string;
  chunks: SearchResult[];
  contextBlocks: ContextBlock[];
}

export interface ContextBlock {
  source: string;
  priority: number;
  content: string;
}

// ─── Config Types ─────────────────────────────────────────

export interface ProjectConfig {
  readonly id: string;
  readonly displayName?: string;
  readonly sharedNamespace?: string;
  readonly dir?: string;
}

export interface PluginConfig {
  readonly enabled: boolean;
  readonly options: Record<string, unknown>;
}

// ─── Logger ───────────────────────────────────────────────

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

// ─── Plugin Types ─────────────────────────────────────────

export interface PluginStorage {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
  list(prefix?: string): Promise<string[]>;
}

export interface PluginContext {
  readonly db: unknown;
  readonly config: PluginConfig;
  readonly projectConfig: ProjectConfig;
  readonly logger: Logger;
  readonly storage: PluginStorage;
}

export interface Migration {
  version: number;
  description: string;
  up: string;
  down?: string;
}

export interface MCPToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler(args: unknown, ctx: PluginContext): Promise<MCPToolResult>;
}

export interface MCPToolResult {
  content: unknown;
  isError?: boolean;
}

export interface CLICommandDefinition {
  name: string;
  description: string;
  options?: CLIOption[];
  handler(args: Record<string, unknown>, ctx: PluginContext): Promise<void>;
}

export interface CLIOption {
  name: string;
  description: string;
  required?: boolean;
  defaultValue?: unknown;
}

export interface Plugin {
  readonly name: string;
  readonly version: string;
  readonly description?: string;
  readonly tokenBudget?: number;

  init?(ctx: PluginContext): Promise<void> | void;
  shutdown?(ctx: PluginContext): Promise<void> | void;

  beforeCapture?(chunk: RawChunk, ctx: PluginContext): Promise<RawChunk | null> | RawChunk | null;
  afterCapture?(chunk: StoredChunk, ctx: PluginContext): Promise<void> | void;

  beforeSearch?(query: SearchQuery, ctx: PluginContext): Promise<SearchQuery> | SearchQuery;
  afterSearch?(
    results: SearchResult[],
    ctx: PluginContext,
  ): Promise<SearchResult[]> | SearchResult[];

  enrichContext?(
    injection: ContextInjection,
    ctx: PluginContext,
  ): Promise<ContextInjection> | ContextInjection;

  migrations?(): Migration[];
  mcpTools?(): MCPToolDefinition[];
  cliCommands?(): CLICommandDefinition[];
}

// ─── Report Types ────────────────────────────────────────

export interface Report {
  id: number;
  type: "analysis" | "proposal";
  source: "webui" | "claude";
  title: string;
  content: string;
  status: "unread" | "read";
  createdAt: string;
}

// ─── Maintenance Types ────────────────────────────────────

export interface MaintenanceRun {
  id: number;
  ranAt: string;
  chunksDeleted: number;
  sessionsDeleted: number;
  bytesReclaimed: number;
  durationMs: number;
}

export interface MaintenanceResult {
  chunksDeleted: number;
  sessionsDeleted: number;
  bytesReclaimed: number;
  durationMs: number;
}
