import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCli, createTempDir, removeTempDir } from "../../test-utils.js";
import { resolvePluginDistPath, PLUGIN_REGISTRY } from "../plugin/registry.js";
import { toPortablePath } from "../setup/hooks.js";

function distKey(shortName: string): string {
  const def = PLUGIN_REGISTRY.find((p) => p.shortName === shortName)!;
  return resolvePluginDistPath(def);
}

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

  it("should deploy kizuna-recap skill to .claude/skills/", () => {
    runCli(`setup --cwd ${tempDir}`, tempDir);
    const recapPath = join(tempDir, ".claude", "skills", "kizuna-recap", "SKILL.md");
    expect(existsSync(recapPath)).toBe(true);
    const content = readFileSync(recapPath, "utf-8");
    expect(content).toContain("name: recap");
    expect(content).toContain("kizuna recap --project <path>");
  });

  it("should overwrite kizuna-recap skill on re-run", () => {
    runCli(`setup --cwd ${tempDir}`, tempDir);
    const recapPath = join(tempDir, ".claude", "skills", "kizuna-recap", "SKILL.md");
    writeFileSync(recapPath, "old content");
    runCli(`setup --cwd ${tempDir}`, tempDir);
    const content = readFileSync(recapPath, "utf-8");
    expect(content).toContain("name: recap");
    expect(content).not.toContain("old content");
  });

  it("should not deploy session-start skill", () => {
    runCli(`setup --cwd ${tempDir}`, tempDir);
    expect(existsSync(join(tempDir, ".claude", "skills", "session-start", "SKILL.md"))).toBe(false);
    expect(existsSync(join(tempDir, ".claude", "skills", "kizuna-session-start"))).toBe(false);
    expect(existsSync(join(tempDir, ".claude", "commands", "session-start.md"))).toBe(false);
  });

  it("should not configure MCP server without --with-mcp", () => {
    runCli(`setup --cwd ${tempDir}`, tempDir);
    expect(existsSync(join(tempDir, ".mcp.json"))).toBe(false);
  });

  it("should configure MCP server in .mcp.json with --with-mcp", () => {
    const result = runCli(`setup --with-mcp --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("MCP server configured");

    const mcpJson = JSON.parse(readFileSync(join(tempDir, ".mcp.json"), "utf-8")) as Record<
      string,
      unknown
    >;
    const mcpServers = mcpJson["mcpServers"] as Record<string, unknown>;
    expect(mcpServers["kizuna"]).toBeDefined();

    const kizunaServer = mcpServers["kizuna"] as {
      command: string;
      args: string[];
      env: Record<string, string>;
    };
    expect(kizunaServer.command).toBe("node");
    expect(kizunaServer.args[0]).toContain("main.js");
    expect(kizunaServer.env["KIZUNA_DB_PATH"]).toBe(
      toPortablePath(join(tempDir, ".kizuna", "memory.db")),
    );
    expect(kizunaServer.env["KIZUNA_PROJECT_DIR"]).toBe(toPortablePath(tempDir));

    const settings = JSON.parse(
      readFileSync(join(tempDir, ".claude", "settings.json"), "utf-8"),
    ) as Record<string, unknown>;
    expect(settings["mcpServers"]).toBeUndefined();
  });

  it("should preserve existing entries in .mcp.json on re-run with --with-mcp", () => {
    writeFileSync(
      join(tempDir, ".mcp.json"),
      JSON.stringify({
        mcpServers: { other: { command: "other-server", args: [] } },
      }),
    );

    runCli(`setup --with-mcp --cwd ${tempDir}`, tempDir);
    const mcpJson = JSON.parse(readFileSync(join(tempDir, ".mcp.json"), "utf-8")) as Record<
      string,
      unknown
    >;
    const mcpServers = mcpJson["mcpServers"] as Record<string, unknown>;
    expect(mcpServers["other"]).toBeDefined();
    expect(mcpServers["kizuna"]).toBeDefined();
  });

  it("should update kizuna MCP entry on re-run with --with-mcp", () => {
    runCli(`setup --with-mcp --cwd ${tempDir}`, tempDir);
    runCli(`setup --with-mcp --cwd ${tempDir}`, tempDir);
    const mcpJson = JSON.parse(readFileSync(join(tempDir, ".mcp.json"), "utf-8")) as Record<
      string,
      unknown
    >;
    const mcpServers = mcpJson["mcpServers"] as Record<string, unknown>;
    const keys = Object.keys(mcpServers);
    expect(keys.filter((k) => k === "kizuna")).toHaveLength(1);
  });

  it("should migrate kizuna MCP entry from settings.json to .mcp.json", () => {
    const claudeDir = join(tempDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    writeFileSync(
      join(claudeDir, "settings.json"),
      JSON.stringify({
        mcpServers: {
          kizuna: {
            command: "node",
            args: ["/old/path/main.js"],
            env: { KIZUNA_DB_PATH: "/old/path/memory.db" },
          },
          other: { command: "other-server", args: [] },
        },
      }),
    );

    runCli(`setup --with-mcp --cwd ${tempDir}`, tempDir);

    const settings = JSON.parse(readFileSync(join(claudeDir, "settings.json"), "utf-8")) as Record<
      string,
      unknown
    >;
    const settingsMcp = settings["mcpServers"] as Record<string, unknown>;
    expect(settingsMcp["kizuna"]).toBeUndefined();
    expect(settingsMcp["other"]).toBeDefined();

    const mcpJson = JSON.parse(readFileSync(join(tempDir, ".mcp.json"), "utf-8")) as Record<
      string,
      unknown
    >;
    const mcpServers = mcpJson["mcpServers"] as Record<string, unknown>;
    const kizunaServer = mcpServers["kizuna"] as { args: string[] };
    expect(kizunaServer.args[0]).toMatch(/^\$\{HOME\}\//);
  });

  it("should run plugin migrations when plugins.json already has enabled plugins", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    writeFileSync(
      join(kizunaDir, "plugins.json"),
      JSON.stringify({
        plugins: {
          [distKey("pii-sanitizer")]: { enabled: true },
        },
      }),
    );

    const result = runCli(`setup --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Kizuna hooks configured");
    expect(result.stdout).toContain("Plugin migrations: 1 plugin(s) initialized.");
  });

  it("should not run plugin migrations when plugins.json is newly created", () => {
    const result = runCli(`setup --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Kizuna hooks configured");
    expect(result.stdout).not.toContain("Plugin migrations:");
  });
});
