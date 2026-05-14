import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli, createTempDir, removeTempDir } from "../../test-utils.js";

describe("setup command", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  it("should create .kizuna directory and configure hooks", () => {
    const result = runCli(`setup --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Kizuna hooks configured");
    expect(existsSync(join(tempDir, ".kizuna"))).toBe(true);
    expect(existsSync(join(tempDir, ".claude", "settings.json"))).toBe(true);

    const settings = JSON.parse(
      readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8"),
    ) as Record<string, unknown>;
    const hooks = settings["hooks"] as Record<string, unknown>;
    expect(hooks["SessionEnd"]).toBeDefined();
    expect(hooks["UserPromptSubmit"]).toBeDefined();
  });

  it("should preserve existing settings", () => {
    const claudeDir = join(tempDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, "settings.json"),
      JSON.stringify({ permissions: { allow: ["Bash(git *)"] } }),
    );

    const result = runCli(`setup --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);

    const settings = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8")) as Record<
      string,
      unknown
    >;
    const permissions = settings["permissions"] as Record<string, unknown>;
    expect(permissions["allow"]).toContain("Bash(git *)");
    const hooks = settings["hooks"] as Record<string, unknown>;
    expect(hooks["SessionEnd"]).toBeDefined();
  });

  it("should inject usage guide into CLAUDE.md", () => {
    runCli(`setup --cwd ${tempDir}`, tempDir);
    const claudeMd = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
    expect(claudeMd).toContain("## Kizuna (Long-term Memory)");
    expect(claudeMd).toContain("kizuna search <query>");
    expect(claudeMd).toContain("kizuna stats");
  });

  it("should append to existing CLAUDE.md", () => {
    writeFileSync(join(tempDir, "CLAUDE.md"), "# My Project\n\nExisting content.\n");
    runCli(`setup --cwd ${tempDir}`, tempDir);
    const claudeMd = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
    expect(claudeMd).toContain("# My Project");
    expect(claudeMd).toContain("Existing content.");
    expect(claudeMd).toContain("## Kizuna (Long-term Memory)");
  });

  it("should not duplicate section on re-run", () => {
    runCli(`setup --cwd ${tempDir}`, tempDir);
    runCli(`setup --cwd ${tempDir}`, tempDir);
    const claudeMd = readFileSync(join(tempDir, "CLAUDE.md"), "utf-8");
    const matches = claudeMd.match(/## Kizuna \(Long-term Memory\)/g);
    expect(matches).toHaveLength(1);
  });

  it("should deploy recap skill to .claude/commands/", () => {
    runCli(`setup --cwd ${tempDir}`, tempDir);
    const recapPath = join(tempDir, ".claude", "commands", "recap.md");
    expect(existsSync(recapPath)).toBe(true);
    const content = readFileSync(recapPath, "utf-8");
    expect(content).toContain("name: recap");
    expect(content).toContain("kizuna recap --project <path>");
  });

  it("should overwrite recap skill on re-run", () => {
    runCli(`setup --cwd ${tempDir}`, tempDir);
    const recapPath = join(tempDir, ".claude", "commands", "recap.md");
    writeFileSync(recapPath, "old content");
    runCli(`setup --cwd ${tempDir}`, tempDir);
    const content = readFileSync(recapPath, "utf-8");
    expect(content).toContain("name: recap");
    expect(content).not.toContain("old content");
  });

  it("should deploy session-start skill to .claude/commands/", () => {
    runCli(`setup --cwd ${tempDir}`, tempDir);
    const sessionStartPath = join(tempDir, ".claude", "commands", "session-start.md");
    expect(existsSync(sessionStartPath)).toBe(true);
    const content = readFileSync(sessionStartPath, "utf-8");
    expect(content).toContain("name: session-start");
    expect(content).toContain("kizuna recap --last 1 --limit 3");
  });

  it("should not overwrite session-start skill on re-run", () => {
    runCli(`setup --cwd ${tempDir}`, tempDir);
    const sessionStartPath = join(tempDir, ".claude", "commands", "session-start.md");
    writeFileSync(sessionStartPath, "custom content");
    runCli(`setup --cwd ${tempDir}`, tempDir);
    const content = readFileSync(sessionStartPath, "utf-8");
    expect(content).toBe("custom content");
  });

  it("should not configure MCP server without --with-mcp", () => {
    runCli(`setup --cwd ${tempDir}`, tempDir);
    const settings = JSON.parse(
      readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8"),
    ) as Record<string, unknown>;
    expect(settings["mcpServers"]).toBeUndefined();
  });

  it("should configure MCP server with --with-mcp", () => {
    const result = runCli(`setup --with-mcp --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("MCP server configured");

    const settings = JSON.parse(
      readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8"),
    ) as Record<string, unknown>;
    const mcpServers = settings["mcpServers"] as Record<string, unknown>;
    expect(mcpServers["kizuna"]).toBeDefined();

    const kizunaServer = mcpServers["kizuna"] as {
      command: string;
      args: string[];
      env: Record<string, string>;
    };
    expect(kizunaServer.command).toBe("node");
    expect(kizunaServer.args[0]).toContain("main.js");
    expect(kizunaServer.env["KIZUNA_DB_PATH"]).toContain(".kizuna/memory.db");
    expect(kizunaServer.env["KIZUNA_PROJECT_DIR"]).toBe(tempDir);
  });

  it("should preserve existing mcpServers on re-run with --with-mcp", () => {
    const claudeDir = join(tempDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, "settings.json"),
      JSON.stringify({
        mcpServers: { other: { command: "other-server", args: [] } },
      }),
    );

    runCli(`setup --with-mcp --cwd ${tempDir}`, tempDir);
    const settings = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8")) as Record<
      string,
      unknown
    >;
    const mcpServers = settings["mcpServers"] as Record<string, unknown>;
    expect(mcpServers["other"]).toBeDefined();
    expect(mcpServers["kizuna"]).toBeDefined();
  });

  it("should update kizuna MCP entry on re-run with --with-mcp", () => {
    runCli(`setup --with-mcp --cwd ${tempDir}`, tempDir);
    runCli(`setup --with-mcp --cwd ${tempDir}`, tempDir);
    const settings = JSON.parse(
      readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8"),
    ) as Record<string, unknown>;
    const mcpServers = settings["mcpServers"] as Record<string, unknown>;
    const keys = Object.keys(mcpServers);
    expect(keys.filter((k) => k === "kizuna")).toHaveLength(1);
  });
});
