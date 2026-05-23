import { describe, it, expect } from "vitest";
import { RECAP_SKILL_CONTENT } from "./recap-skill.js";

describe("RECAP_SKILL_CONTENT", () => {
  it("should contain YAML frontmatter with name and description", () => {
    expect(RECAP_SKILL_CONTENT).toMatch(/^---\nname: kizuna-recap\n/);
    expect(RECAP_SKILL_CONTENT).toContain("description:");
  });

  it("should describe cross-project usage only", () => {
    expect(RECAP_SKILL_CONTENT).toContain("クロスプロジェクト専用");
  });

  it("should reference /session-start for self-project recap", () => {
    expect(RECAP_SKILL_CONTENT).toContain("/session-start");
  });

  it("should require --project parameter", () => {
    expect(RECAP_SKILL_CONTENT).toContain("--project");
    expect(RECAP_SKILL_CONTENT).toContain("必須");
  });

  it("should not mention self-project recap as possible", () => {
    expect(RECAP_SKILL_CONTENT).not.toContain("現在のプロジェクト自身の recap");
    expect(RECAP_SKILL_CONTENT).not.toContain("--project` なし）も可能");
  });

  it("should end with a trailing newline", () => {
    expect(RECAP_SKILL_CONTENT).toMatch(/\n$/);
  });
});
