import type { Database } from "../storage/database.js";
import type { StoredChunk } from "../index.js";
import { parseTranscriptFile, parseTranscriptContent } from "./transcript-parser.js";
import { chunkifyTurns } from "./chunker.js";

export interface CaptureResult {
  sessionId: string;
  chunksStored: number;
  totalTokens: number;
}

export interface CaptureOptions {
  sessionId: string;
  projectId: string;
  transcriptPath?: string;
  transcriptContent?: string;
}

export function captureTranscript(db: Database, options: CaptureOptions): CaptureResult {
  const { sessionId, projectId, transcriptPath, transcriptContent } = options;

  const turns = transcriptPath
    ? parseTranscriptFile(transcriptPath)
    : parseTranscriptContent(transcriptContent ?? "");

  if (turns.length === 0) {
    return { sessionId, chunksStored: 0, totalTokens: 0 };
  }

  const startedAt = turns[0]!.timestamp;
  const endedAt = turns[turns.length - 1]!.timestamp;

  db.insertSession({
    id: sessionId,
    projectId,
    startedAt,
    endedAt,
    transcriptPath: transcriptPath ?? null,
    metadata: {},
  });

  const rawChunks = chunkifyTurns(sessionId, turns);
  const storedChunks: StoredChunk[] = [];

  for (const chunk of rawChunks) {
    storedChunks.push(db.insertChunk(chunk));
  }

  const totalTokens = storedChunks.reduce((sum, c) => sum + c.tokenCount, 0);

  return {
    sessionId,
    chunksStored: storedChunks.length,
    totalTokens,
  };
}
