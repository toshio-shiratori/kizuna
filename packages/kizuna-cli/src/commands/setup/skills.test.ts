import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { deployRecapSkill } from "./skills.js";
import { RECAP_SKILL_CONTENT } from "../../templates/recap-skill.js";

describe("deployRecapSkill", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), "kizuna-skills-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create SKILL.md and return "created" when it does not exist', () => {
    const claudeDir = resolve(tmpDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });

    const result = deployRecapSkill(claudeDir);

    expect(result).toBe("created");
    const skillPath = resolve(claudeDir, "skills", "kizuna-recap", "SKILL.md");
    expect(existsSync(skillPath)).toBe(true);
    expect(readFileSync(skillPath, "utf-8")).toBe(RECAP_SKILL_CONTENT);
  });

  it('should overwrite SKILL.md and return "updated" when it already exists', () => {
    const claudeDir = resolve(tmpDir, ".claude");
    const skillDir = resolve(claudeDir, "skills", "kizuna-recap");
    mkdirSync(skillDir, { recursive: true });
    writeFileSync(resolve(skillDir, "SKILL.md"), "old content");

    const result = deployRecapSkill(claudeDir);

    expect(result).toBe("updated");
    expect(readFileSync(resolve(skillDir, "SKILL.md"), "utf-8")).toBe(RECAP_SKILL_CONTENT);
  });

  it("should create skills directory if it does not exist", () => {
    const claudeDir = resolve(tmpDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });

    deployRecapSkill(claudeDir);

    expect(existsSync(resolve(claudeDir, "skills", "kizuna-recap"))).toBe(true);
  });
});
