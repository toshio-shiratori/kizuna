import { describe, it, expect } from "vitest";
import { SESSION_START_SKILL_CONTENT } from "./session-start-skill.js";

describe("SESSION_START_SKILL_CONTENT", () => {
  it("should contain YAML frontmatter with name and description", () => {
    expect(SESSION_START_SKILL_CONTENT).toMatch(/^---\nname: session-start\n/);
    expect(SESSION_START_SKILL_CONTENT).toContain("description:");
  });

  it("should include git status check steps", () => {
    expect(SESSION_START_SKILL_CONTENT).toContain("git branch --show-current");
    expect(SESSION_START_SKILL_CONTENT).toContain("git status --short");
    expect(SESSION_START_SKILL_CONTENT).toContain("git log --oneline -5");
  });

  it("should include unpushed commits check", () => {
    expect(SESSION_START_SKILL_CONTENT).toContain("@{upstream}..HEAD");
  });

  it("should include kizuna recap for previous session", () => {
    expect(SESSION_START_SKILL_CONTENT).toContain("kizuna recap --last 1 --limit 3");
  });

  it("should mention skipping when kizuna is not set up", () => {
    expect(SESSION_START_SKILL_CONTENT).toContain("未セットアップ");
    expect(SESSION_START_SKILL_CONTENT).toContain("スキップ");
  });

  it("should include session report template", () => {
    expect(SESSION_START_SKILL_CONTENT).toContain("セッション開始レポート");
    expect(SESSION_START_SKILL_CONTENT).toContain("前回セッション");
    expect(SESSION_START_SKILL_CONTENT).toContain("推奨アクション");
  });

  it("should not include project-specific sections like roadmap or PR/Issue", () => {
    expect(SESSION_START_SKILL_CONTENT).not.toContain("ロードマップ");
    expect(SESSION_START_SKILL_CONTENT).not.toContain("gh pr list");
    expect(SESSION_START_SKILL_CONTENT).not.toContain("gh issue list");
  });

  it("should not contain personal paths", () => {
    expect(SESSION_START_SKILL_CONTENT).not.toMatch(/\/Users\/[a-zA-Z]+/);
    expect(SESSION_START_SKILL_CONTENT).not.toMatch(/\/home\/[a-zA-Z]+/);
  });

  it("should end with a trailing newline", () => {
    expect(SESSION_START_SKILL_CONTENT).toMatch(/\n$/);
  });
});
