import type { StoredChunk, Session, MaintenanceRun } from "../../index.js";

export interface ChunkRow {
  id: number;
  session_id: string;
  turn_index: number;
  role: "user" | "assistant";
  content: string;
  token_count: number;
  importance: number;
  created_at: string;
  metadata: string;
}

export interface SessionRow {
  id: string;
  project_id: string;
  started_at: string;
  ended_at: string | null;
  transcript_path: string | null;
  metadata: string;
}

export interface MaintenanceRow {
  id: number;
  ran_at: string;
  chunks_deleted: number;
  sessions_deleted: number;
  bytes_reclaimed: number;
  duration_ms: number;
}

export interface SessionPreviewRow {
  session_id: string;
  started_at: string;
  project_id: string;
  preview: string;
}

export interface FtsRow extends ChunkRow {
  bm25_score: number;
  time_decay: number;
}

export function chunkRowToStoredChunk(row: ChunkRow): StoredChunk {
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

export function sessionRowToSession(row: SessionRow): Session {
  return {
    id: row.id,
    projectId: row.project_id,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    transcriptPath: row.transcript_path,
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
  };
}

export function maintenanceRowToRun(row: MaintenanceRow): MaintenanceRun {
  return {
    id: row.id,
    ranAt: row.ran_at,
    chunksDeleted: row.chunks_deleted,
    sessionsDeleted: row.sessions_deleted,
    bytesReclaimed: row.bytes_reclaimed,
    durationMs: row.duration_ms,
  };
}
