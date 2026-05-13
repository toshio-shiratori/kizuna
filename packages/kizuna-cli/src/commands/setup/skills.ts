import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { RECAP_SKILL_CONTENT } from "../../templates/recap-skill.js";
import { SESSION_START_SKILL_CONTENT } from "../../templates/session-start-skill.js";

// Always overwrite — kizuna-managed template that should stay in sync with the installed version
export function deployRecapSkill(claudeDir: string): "created" | "updated" {
  const commandsDir = resolve(claudeDir, "commands");
  if (!existsSync(commandsDir)) {
    mkdirSync(commandsDir, { recursive: true });
  }

  const recapPath = resolve(commandsDir, "recap.md");
  const existed = existsSync(recapPath);
  writeFileSync(recapPath, RECAP_SKILL_CONTENT);
  return existed ? "updated" : "created";
}

// Skip if exists — users may customize this for their project (e.g. add roadmap, PR/Issue checks)
export function deploySessionStartSkill(claudeDir: string): "created" | "skipped" {
  const commandsDir = resolve(claudeDir, "commands");
  if (!existsSync(commandsDir)) {
    mkdirSync(commandsDir, { recursive: true });
  }

  const sessionStartPath = resolve(commandsDir, "session-start.md");
  if (existsSync(sessionStartPath)) {
    return "skipped";
  }
  writeFileSync(sessionStartPath, SESSION_START_SKILL_CONTENT);
  return "created";
}
