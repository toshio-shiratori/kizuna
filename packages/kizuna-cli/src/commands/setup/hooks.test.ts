import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir, homedir } from "node:os";
import type { ClaudeSettings, McpJsonConfig } from "./hooks.js";
import { configureHooks, toTildePath } from "./hooks.js";

describe("toTildePath", () => {
  it("should replace homedir prefix with ~", () => {
    const home = homedir();
    expect(toTildePath(`${home}/projects/foo`)).toBe("~/projects/foo");
  });

  it("should return path unchanged if not under homedir", () => {
    expect(toTildePath("/opt/some/path")).toBe("/opt/some/path");
  });

  it("should not match partial homedir prefix", () => {
    const home = homedir();
    expect(toTildePath(`${home}-suffix/foo`)).toBe(`${home}-suffix/foo`);
  });

  it("should handle homedir exactly", () => {
    const home = homedir();
    expect(toTildePath(home)).toBe("~");
  });
});

describe("configureHooks", () => {
  let tmpDir: string;
  let claudeDir: string;
  let settingsPath: string;
  let kizunaDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(resolve(tmpdir(), "kizuna-hooks-test-"));
    claudeDir = resolve(tmpDir, ".claude");
    mkdirSync(claudeDir, { recursive: true });
    settingsPath = resolve(claudeDir, "settings.json");
    kizunaDir = resolve(tmpDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should create settings.json with all four hooks when it does not exist", () => {
    const result = configureHooks(settingsPath, "kizuna", {
      cwd: tmpDir,
      kizunaDir,
    });

    expect(result.mcpConfigured).toBe(false);

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as ClaudeSettings;
    expect(settings.hooks).toBeDefined();
    expect(Object.keys(settings.hooks!)).toEqual(
      expect.arrayContaining(["SessionStart", "SessionEnd", "UserPromptSubmit", "Stop"]),
    );

    for (const event of ["SessionStart", "SessionEnd", "UserPromptSubmit", "Stop"]) {
      const matchers = settings.hooks![event]!;
      expect(matchers).toHaveLength(1);
      expect(matchers[0]!.hooks[0]!.command).toContain("kizuna hook");
    }
  });

  it("should preserve existing non-kizuna hooks", () => {
    const existing: ClaudeSettings = {
      hooks: {
        SessionEnd: [
          {
            matcher: "",
            hooks: [{ type: "command", command: "other-tool save" }],
          },
        ],
      },
    };
    writeFileSync(settingsPath, JSON.stringify(existing, null, 2) + "\n");

    configureHooks(settingsPath, "kizuna", { cwd: tmpDir, kizunaDir });

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as ClaudeSettings;
    const sessionEndHooks = settings.hooks!["SessionEnd"]!;
    expect(sessionEndHooks).toHaveLength(2);
    expect(sessionEndHooks[0]!.hooks[0]!.command).toBe("other-tool save");
    expect(sessionEndHooks[1]!.hooks[0]!.command).toContain("kizuna hook");
  });

  it("should update existing kizuna hooks in place", () => {
    const existing: ClaudeSettings = {
      hooks: {
        SessionEnd: [
          {
            matcher: "",
            hooks: [{ type: "command", command: "old-kizuna hook session-end" }],
          },
        ],
      },
    };
    writeFileSync(settingsPath, JSON.stringify(existing, null, 2) + "\n");

    configureHooks(settingsPath, "kizuna", { cwd: tmpDir, kizunaDir });

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as ClaudeSettings;
    const sessionEndHooks = settings.hooks!["SessionEnd"]!;
    expect(sessionEndHooks).toHaveLength(1);
    expect(sessionEndHooks[0]!.hooks[0]!.command).toBe("kizuna hook session-end");
  });

  it("should update existing cli.js hook references", () => {
    const existing: ClaudeSettings = {
      hooks: {
        SessionEnd: [
          {
            matcher: "",
            hooks: [{ type: "command", command: "node /some/path/cli.js hook session-end" }],
          },
        ],
      },
    };
    writeFileSync(settingsPath, JSON.stringify(existing, null, 2) + "\n");

    configureHooks(settingsPath, "kizuna", { cwd: tmpDir, kizunaDir });

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as ClaudeSettings;
    const sessionEndHooks = settings.hooks!["SessionEnd"]!;
    expect(sessionEndHooks).toHaveLength(1);
    expect(sessionEndHooks[0]!.hooks[0]!.command).toBe("kizuna hook session-end");
  });

  it("should preserve existing settings fields", () => {
    const existing: ClaudeSettings = {
      customField: "value",
      hooks: {},
    };
    writeFileSync(settingsPath, JSON.stringify(existing, null, 2) + "\n");

    configureHooks(settingsPath, "kizuna", { cwd: tmpDir, kizunaDir });

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as ClaudeSettings;
    expect(settings.customField).toBe("value");
  });

  it("should use the provided bin path in hook commands", () => {
    configureHooks(settingsPath, "node /custom/cli.js", {
      cwd: tmpDir,
      kizunaDir,
    });

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as ClaudeSettings;
    const hook = settings.hooks!["SessionEnd"]![0]!.hooks[0]!;
    expect(hook.command).toBe("node /custom/cli.js hook session-end");
  });

  it("should configure MCP server in .mcp.json when withMcp is true", () => {
    const result = configureHooks(settingsPath, "kizuna", {
      withMcp: true,
      cwd: tmpDir,
      kizunaDir,
    });

    expect(result.mcpConfigured).toBe(true);

    const mcpJsonPath = resolve(tmpDir, ".mcp.json");
    expect(existsSync(mcpJsonPath)).toBe(true);
    const mcpJson = JSON.parse(readFileSync(mcpJsonPath, "utf-8")) as McpJsonConfig;
    expect(mcpJson.mcpServers).toBeDefined();
    expect(mcpJson.mcpServers!["kizuna"]).toBeDefined();
    expect(mcpJson.mcpServers!["kizuna"]!.command).toBe("node");
    expect(mcpJson.mcpServers!["kizuna"]!.env!["KIZUNA_DB_PATH"]).toBe(
      toTildePath(resolve(kizunaDir, "memory.db")),
    );
    expect(mcpJson.mcpServers!["kizuna"]!.env!["KIZUNA_PROJECT_DIR"]).toBe(toTildePath(tmpDir));

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as ClaudeSettings;
    expect(settings.mcpServers).toBeUndefined();
  });

  it("should not configure MCP server when withMcp is not set", () => {
    const result = configureHooks(settingsPath, "kizuna", {
      cwd: tmpDir,
      kizunaDir,
    });

    expect(result.mcpConfigured).toBe(false);

    const mcpJsonPath = resolve(tmpDir, ".mcp.json");
    expect(existsSync(mcpJsonPath)).toBe(false);
  });

  it("should preserve existing entries in .mcp.json", () => {
    const mcpJsonPath = resolve(tmpDir, ".mcp.json");
    writeFileSync(
      mcpJsonPath,
      JSON.stringify({
        mcpServers: { other: { command: "other-server", args: [] } },
      }),
    );

    configureHooks(settingsPath, "kizuna", {
      withMcp: true,
      cwd: tmpDir,
      kizunaDir,
    });

    const mcpJson = JSON.parse(readFileSync(mcpJsonPath, "utf-8")) as McpJsonConfig;
    expect(mcpJson.mcpServers!["other"]).toBeDefined();
    expect(mcpJson.mcpServers!["kizuna"]).toBeDefined();
  });

  it("should migrate kizuna entry from settings.json to .mcp.json", () => {
    const existing: ClaudeSettings = {
      mcpServers: {
        kizuna: {
          command: "node",
          args: ["/old/path/main.js"],
          env: { KIZUNA_DB_PATH: "/old/path/memory.db" },
        },
        other: { command: "other-server", args: [] },
      },
    };
    writeFileSync(settingsPath, JSON.stringify(existing, null, 2) + "\n");

    configureHooks(settingsPath, "kizuna", {
      withMcp: true,
      cwd: tmpDir,
      kizunaDir,
    });

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as ClaudeSettings;
    expect(settings.mcpServers!["kizuna"]).toBeUndefined();
    expect(settings.mcpServers!["other"]).toBeDefined();

    const mcpJsonPath = resolve(tmpDir, ".mcp.json");
    const mcpJson = JSON.parse(readFileSync(mcpJsonPath, "utf-8")) as McpJsonConfig;
    expect(mcpJson.mcpServers!["kizuna"]!.args[0]).toMatch(/^~\//);
  });

  it("should remove empty mcpServers from settings.json after migration", () => {
    const existing: ClaudeSettings = {
      hooks: {},
      mcpServers: {
        kizuna: {
          command: "node",
          args: ["/old/path/main.js"],
        },
      },
    };
    writeFileSync(settingsPath, JSON.stringify(existing, null, 2) + "\n");

    configureHooks(settingsPath, "kizuna", {
      withMcp: true,
      cwd: tmpDir,
      kizunaDir,
    });

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as ClaudeSettings;
    expect(settings.mcpServers).toBeUndefined();
    expect(settings.hooks).toBeDefined();
  });
});
