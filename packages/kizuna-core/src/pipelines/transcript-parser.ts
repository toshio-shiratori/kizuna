import { readFileSync } from "node:fs";

export interface TranscriptEntry {
  type: string;
  uuid: string;
  parentUuid?: string;
  timestamp: string;
  sessionId: string;
  message?: {
    role: string;
    content: string | ContentBlock[];
  };
}

interface ContentBlock {
  type: string;
  text?: string;
  thinking?: string;
}

export interface ParsedTurn {
  role: "user" | "assistant";
  text: string;
  timestamp: string;
  uuid: string;
}

export function parseTranscriptFile(filePath: string): ParsedTurn[] {
  const content = readFileSync(filePath, "utf-8");
  return parseTranscriptContent(content);
}

export function parseTranscriptContent(content: string): ParsedTurn[] {
  const turns: ParsedTurn[] = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    let entry: TranscriptEntry;
    try {
      entry = JSON.parse(trimmed) as TranscriptEntry;
    } catch {
      continue;
    }

    if (entry.type !== "user" && entry.type !== "assistant") continue;
    if (!entry.message) continue;

    const text = extractText(entry.message.content);
    if (text.length === 0) continue;

    const role = entry.type as "user" | "assistant";
    turns.push({
      role,
      text,
      timestamp: entry.timestamp,
      uuid: entry.uuid,
    });
  }

  return turns;
}

function extractText(content: string | ContentBlock[]): string {
  if (typeof content === "string") return content;

  const parts: string[] = [];
  for (const block of content) {
    if (block.type === "text" && block.text) {
      parts.push(block.text);
    }
  }
  return parts.join("\n");
}
