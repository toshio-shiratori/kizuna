import type { Database } from "../storage/database.js";
import type { StoredChunk } from "../index.js";
import type { PluginManager } from "../plugin/plugin-manager.js";
import { parseTranscriptFile, parseTranscriptContent } from "./transcript-parser.js";
import { chunkifyTurns, isLowQualityContent, truncateChunk, estimateTokens } from "./chunker.js";
import { PIPELINE_DEFAULTS } from "../config/defaults.js";

export interface CaptureResult {
  sessionId: string;
  chunksStored: number;
  chunksSkipped: number;
  totalTokens: number;
}

export interface CaptureOptions {
  sessionId: string;
  projectId: string;
  transcriptPath?: string;
  transcriptContent?: string;
  pluginManager?: PluginManager;
  noisePatterns?: readonly string[];
  maxChunkSize?: number;
}

export async function captureTranscript(
  db: Database,
  options: CaptureOptions,
): Promise<CaptureResult> {
  const {
    sessionId,
    projectId,
    transcriptPath,
    transcriptContent,
    pluginManager,
    noisePatterns,
    maxChunkSize = PIPELINE_DEFAULTS.maxChunkSize,
  } = options;

  const turns = transcriptPath
    ? parseTranscriptFile(transcriptPath)
    : parseTranscriptContent(transcriptContent ?? "");

  if (turns.length === 0) {
    return { sessionId, chunksStored: 0, chunksSkipped: 0, totalTokens: 0 };
  }

  const startedAt = turns[0]!.timestamp;
  const endedAt = turns[turns.length - 1]!.timestamp;

  db.beginTransaction();
  try {
    db.upsertSession({
      id: sessionId,
      projectId,
      startedAt,
      endedAt,
      transcriptPath: transcriptPath ?? null,
      metadata: {},
    });

    const maxTurnIndex = db.getMaxTurnIndex(sessionId);
    const rawChunks = chunkifyTurns(sessionId, turns);
    const storedChunks: StoredChunk[] = [];
    let chunksSkipped = 0;

    for (const chunk of rawChunks) {
      if (maxTurnIndex !== null && chunk.turnIndex <= maxTurnIndex) {
        continue;
      }

      if (isLowQualityContent(chunk.content, noisePatterns)) {
        chunksSkipped++;
        continue;
      }

      // Truncate oversized chunks before plugin processing
      const truncatedContent = truncateChunk(chunk.content, maxChunkSize);
      const truncatedChunk =
        truncatedContent !== chunk.content
          ? {
              ...chunk,
              content: truncatedContent,
              tokenCount: estimateTokens(truncatedContent),
            }
          : chunk;

      const processed = pluginManager
        ? await pluginManager.runBeforeCapture(truncatedChunk)
        : truncatedChunk;

      if (processed === null) {
        chunksSkipped++;
        continue;
      }

      const stored = db.insertChunk(processed);
      storedChunks.push(stored);

      if (pluginManager) {
        await pluginManager.runAfterCapture(stored);
      }
    }

    db.commit();

    const totalTokens = storedChunks.reduce((sum, c) => sum + c.tokenCount, 0);

    return {
      sessionId,
      chunksStored: storedChunks.length,
      chunksSkipped,
      totalTokens,
    };
  } catch (e) {
    db.rollback();
    throw e;
  }
}
