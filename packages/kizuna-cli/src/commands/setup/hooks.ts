import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export interface HookEntry {
  type: string;
  command: string;
}

export interface HookMatcher {
  matcher: string;
  hooks: HookEntry[];
}

export interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface ClaudeSettings {
  hooks?: Record<string, HookMatcher[]>;
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

export function findMcpServerPath(): string {
  const mcpMainJs = resolve(
    fileURLToPath(import.meta.url),
    "..",
    "..",
    "..",
    "..",
    "..",
    "kizuna-mcp",
    "dist",
    "main.js",
  );
  if (existsSync(mcpMainJs)) {
    return mcpMainJs;
  }
  try {
    const result = execSync("which kizuna-mcp", { encoding: "utf-8" }).trim();
    if (result) return result;
  } catch {
    // not in PATH
  }
  return mcpMainJs;
}

export interface ConfigureHooksResult {
  mcpConfigured: boolean;
}

export function configureHooks(
  settingsPath: string,
  bin: string,
  opts: { withMcp?: boolean; cwd: string; kizunaDir: string },
): ConfigureHooksResult {
  let settings: ClaudeSettings = {};
  if (existsSync(settingsPath)) {
    settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as ClaudeSettings;
  }

  if (!settings.hooks) {
    settings.hooks = {};
  }

  const hooks = settings.hooks;

  const kizunaHooks = {
    SessionStart: {
      matcher: "",
      hook: {
        type: "command",
        command: `${bin} hook session-start`,
      },
    },
    SessionEnd: {
      matcher: "",
      hook: {
        type: "command",
        command: `${bin} hook session-end`,
      },
    },
    UserPromptSubmit: {
      matcher: "",
      hook: {
        type: "command",
        command: `${bin} hook prompt-submit`,
      },
    },
    Stop: {
      matcher: "",
      hook: {
        type: "command",
        command: `${bin} hook stop`,
      },
    },
  };

  for (const [event, config] of Object.entries(kizunaHooks)) {
    if (!hooks[event]) {
      hooks[event] = [];
    }

    const existingIdx = hooks[event]!.findIndex((m) =>
      m.hooks.some((h) => h.command.includes("kizuna hook") || h.command.includes("cli.js hook")),
    );

    if (existingIdx !== -1) {
      hooks[event]![existingIdx] = {
        matcher: config.matcher,
        hooks: [config.hook],
      };
    } else {
      hooks[event]!.push({
        matcher: config.matcher,
        hooks: [config.hook],
      });
    }
  }

  let mcpConfigured = false;
  if (opts.withMcp) {
    const mcpServerPath = findMcpServerPath();
    const dbPath = resolve(opts.kizunaDir, "memory.db");

    if (!settings.mcpServers) {
      settings.mcpServers = {};
    }

    settings.mcpServers["kizuna"] = {
      command: "node",
      args: [mcpServerPath],
      env: {
        KIZUNA_DB_PATH: dbPath,
        KIZUNA_PROJECT_DIR: opts.cwd,
      },
    };
    mcpConfigured = true;
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");

  return { mcpConfigured };
}
