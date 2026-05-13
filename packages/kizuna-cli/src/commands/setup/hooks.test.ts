import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import type { ClaudeSettings } from "./hooks.js";
import { configureHooks } from "./hooks.js";

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

  it("should configure MCP server when withMcp is true", () => {
    const result = configureHooks(settingsPath, "kizuna", {
      withMcp: true,
      cwd: tmpDir,
      kizunaDir,
    });

    expect(result.mcpConfigured).toBe(true);

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as ClaudeSettings;
    expect(settings.mcpServers).toBeDefined();
    expect(settings.mcpServers!["kizuna"]).toBeDefined();
    expect(settings.mcpServers!["kizuna"]!.command).toBe("node");
    expect(settings.mcpServers!["kizuna"]!.env!["KIZUNA_DB_PATH"]).toBe(
      resolve(kizunaDir, "memory.db"),
    );
    expect(settings.mcpServers!["kizuna"]!.env!["KIZUNA_PROJECT_DIR"]).toBe(tmpDir);
  });

  it("should not configure MCP server when withMcp is not set", () => {
    const result = configureHooks(settingsPath, "kizuna", {
      cwd: tmpDir,
      kizunaDir,
    });

    expect(result.mcpConfigured).toBe(false);

    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as ClaudeSettings;
    expect(settings.mcpServers).toBeUndefined();
  });
});
