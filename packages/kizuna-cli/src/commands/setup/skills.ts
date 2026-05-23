import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { RECAP_SKILL_CONTENT } from "../../templates/recap-skill.js";

export function deployRecapSkill(claudeDir: string): "created" | "updated" {
  const skillDir = resolve(claudeDir, "skills", "kizuna-recap");
  mkdirSync(skillDir, { recursive: true });

  const skillPath = resolve(skillDir, "SKILL.md");
  const existed = existsSync(skillPath);
  writeFileSync(skillPath, RECAP_SKILL_CONTENT);
  return existed ? "updated" : "created";
}
