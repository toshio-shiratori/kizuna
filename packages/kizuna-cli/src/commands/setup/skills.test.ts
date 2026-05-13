import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, existsSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { deployRecapSkill, deploySessionStartSkill } from "./skills.js";
import { RECAP_SKILL_CONTENT } from "../../templates/recap-skill.js";
import { SESSION_START_SKILL_CONTENT } from "../../templates/session-start-skill.js";

describe("deployRecapSkill", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), "kizuna-skills-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create recap.md and return "created" when it does not exist', () => {
    const claudeDir = resolve(tmpDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });

    const result = deployRecapSkill(claudeDir);

    expect(result).toBe("created");
    const recapPath = resolve(claudeDir, "commands", "recap.md");
    expect(existsSync(recapPath)).toBe(true);
    expect(readFileSync(recapPath, "utf-8")).toBe(RECAP_SKILL_CONTENT);
  });

  it('should overwrite recap.md and return "updated" when it already exists', () => {
    const claudeDir = resolve(tmpDir, ".claude");
    const commandsDir = resolve(claudeDir, "commands");
    mkdirSync(commandsDir, { recursive: true });
    writeFileSync(resolve(commandsDir, "recap.md"), "old content");

    const result = deployRecapSkill(claudeDir);

    expect(result).toBe("updated");
    expect(readFileSync(resolve(commandsDir, "recap.md"), "utf-8")).toBe(RECAP_SKILL_CONTENT);
  });

  it("should create commands directory if it does not exist", () => {
    const claudeDir = resolve(tmpDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });

    deployRecapSkill(claudeDir);

    expect(existsSync(resolve(claudeDir, "commands"))).toBe(true);
  });
});

describe("deploySessionStartSkill", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), "kizuna-skills-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should create session-start.md and return "created" when it does not exist', () => {
    const claudeDir = resolve(tmpDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });

    const result = deploySessionStartSkill(claudeDir);

    expect(result).toBe("created");
    const skillPath = resolve(claudeDir, "commands", "session-start.md");
    expect(existsSync(skillPath)).toBe(true);
    expect(readFileSync(skillPath, "utf-8")).toBe(SESSION_START_SKILL_CONTENT);
  });

  it('should skip and return "skipped" when session-start.md already exists', () => {
    const claudeDir = resolve(tmpDir, ".claude");
    const commandsDir = resolve(claudeDir, "commands");
    mkdirSync(commandsDir, { recursive: true });
    const customContent = "custom session-start content";
    writeFileSync(resolve(commandsDir, "session-start.md"), customContent);

    const result = deploySessionStartSkill(claudeDir);

    expect(result).toBe("skipped");
    expect(readFileSync(resolve(commandsDir, "session-start.md"), "utf-8")).toBe(customContent);
  });

  it("should create commands directory if it does not exist", () => {
    const claudeDir = resolve(tmpDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });

    deploySessionStartSkill(claudeDir);

    expect(existsSync(resolve(claudeDir, "commands"))).toBe(true);
  });
});
