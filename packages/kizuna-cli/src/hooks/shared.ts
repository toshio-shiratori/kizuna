import { readFileSync } from "node:fs";
import { basename } from "node:path";

export interface HookInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  hook_event_name: string;
  prompt?: string;
  source?: string;
}

export function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function parseInput(): HookInput {
  try {
    const raw = readFileSync(0, "utf-8");
    return JSON.parse(raw) as HookInput;
  } catch (error) {
    process.stderr.write(`kizuna: failed to parse hook input: ${formatError(error)}\n`);
    return { session_id: "", transcript_path: "", cwd: process.cwd(), hook_event_name: "" };
  }
}

export function getProjectId(cwd: string): string {
  return basename(cwd);
}
