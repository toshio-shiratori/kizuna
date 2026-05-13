import type { Command } from "commander";
import { handleSessionEnd } from "../hooks/session-end.js";
import { handlePromptSubmit } from "../hooks/prompt-submit.js";
import { handleStop } from "../hooks/stop.js";
import { handleSessionStart } from "../hooks/session-start.js";

export function registerHook(program: Command): void {
  const hook = program
    .command("hook")
    .description("Hook handlers invoked by Claude Code (internal use)");

  hook
    .command("session-end")
    .description("Capture transcript on session end")
    .action(handleSessionEnd);

  hook
    .command("prompt-submit")
    .description("Inject relevant memories into prompt context")
    .action(handlePromptSubmit);

  hook
    .command("stop")
    .description("Incrementally capture new turns on assistant stop")
    .action(handleStop);

  hook
    .command("session-start")
    .description("Initialize session context")
    .action(handleSessionStart);
}
