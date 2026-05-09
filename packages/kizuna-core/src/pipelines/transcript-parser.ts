import { readFileSync } from "node:fs";

interface TranscriptEntry {
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

const SYSTEM_TAG_PATTERNS = [
  /<system-reminder>[\s\S]*?<\/system-reminder>/g,
  /<local-command-caveat>[\s\S]*?<\/local-command-caveat>/g,
  /<local-command-stdout>[\s\S]*?<\/local-command-stdout>/g,
  /<command-message>[\s\S]*?<\/command-message>/g,
  /<command-args>[\s\S]*?<\/command-args>/g,
  /<user-prompt-submit-hook>[\s\S]*?<\/user-prompt-submit-hook>/g,
];

export function sanitizeContent(text: string): string {
  if (/<command-name>/.test(text)) {
    return "";
  }

  let result = text;
  for (const pattern of SYSTEM_TAG_PATTERNS) {
    result = result.replace(pattern, "");
  }

  return result.trim();
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
  if (typeof content === "string") return sanitizeContent(content);

  const parts: string[] = [];
  for (const block of content) {
    if (block.type === "text" && block.text) {
      parts.push(block.text);
    }
  }
  return sanitizeContent(parts.join("\n"));
}
