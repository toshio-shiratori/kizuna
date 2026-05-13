import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { KIZUNA_SECTION_MARKER, buildClaudeMdSection, injectClaudeMdSection } from "./claude-md.js";

describe("buildClaudeMdSection", () => {
  it("should include the section marker", () => {
    const section = buildClaudeMdSection();
    expect(section).toContain(KIZUNA_SECTION_MARKER);
  });

  it("should include usage table with kizuna commands", () => {
    const section = buildClaudeMdSection();
    expect(section).toContain("kizuna search");
    expect(section).toContain("kizuna list");
    expect(section).toContain("kizuna stats");
  });
});

describe("injectClaudeMdSection", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), "kizuna-claude-md-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should create CLAUDE.md with section if file does not exist", () => {
    const claudeMdPath = resolve(tmpDir, "CLAUDE.md");
    const result = injectClaudeMdSection(claudeMdPath);

    expect(result).toBe(true);
    const content = readFileSync(claudeMdPath, "utf-8");
    expect(content).toContain(KIZUNA_SECTION_MARKER);
  });

  it("should append section to existing CLAUDE.md", () => {
    const claudeMdPath = resolve(tmpDir, "CLAUDE.md");
    writeFileSync(claudeMdPath, "# My Project\n\nSome content.\n");

    const result = injectClaudeMdSection(claudeMdPath);

    expect(result).toBe(true);
    const content = readFileSync(claudeMdPath, "utf-8");
    expect(content).toContain("# My Project");
    expect(content).toContain(KIZUNA_SECTION_MARKER);
  });

  it("should not modify CLAUDE.md if section already present", () => {
    const claudeMdPath = resolve(tmpDir, "CLAUDE.md");
    const existing = `# My Project\n\n${KIZUNA_SECTION_MARKER}\n\nExisting content.\n`;
    writeFileSync(claudeMdPath, existing);

    const result = injectClaudeMdSection(claudeMdPath);

    expect(result).toBe(false);
    const content = readFileSync(claudeMdPath, "utf-8");
    expect(content).toBe(existing);
  });
});
