import type { Command } from "commander";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { RECAP_SKILL_CONTENT } from "../templates/recap-skill.js";

const KIZUNA_SECTION_MARKER = "## Kizuna (Long-term Memory)";

function buildClaudeMdSection(): string {
  return `
${KIZUNA_SECTION_MARKER}

Memories are captured and recalled automatically via hooks. For active queries:

| Command | Description |
|---------|-------------|
| \`kizuna search <query>\` | Search this project's memories |
| \`kizuna search <query> --cwd <path>\` | Search another project's memories |
| \`kizuna list --session <id>\` | List chunks from a specific session |
| \`kizuna stats\` | Show database statistics |
`;
}

function deployRecapSkill(claudeDir: string): boolean {
  const commandsDir = resolve(claudeDir, "commands");
  if (!existsSync(commandsDir)) {
    mkdirSync(commandsDir, { recursive: true });
  }

  const recapPath = resolve(commandsDir, "recap.md");
  writeFileSync(recapPath, RECAP_SKILL_CONTENT);
  return true;
}

function injectClaudeMdSection(claudeMdPath: string): boolean {
  let content = "";
  if (existsSync(claudeMdPath)) {
    content = readFileSync(claudeMdPath, "utf-8");
    if (content.includes(KIZUNA_SECTION_MARKER)) {
      return false;
    }
  }

  const section = buildClaudeMdSection();
  const newContent = content.length > 0 ? content.trimEnd() + "\n" + section : section.trimStart();
  writeFileSync(claudeMdPath, newContent);
  return true;
}

interface HookEntry {
  type: string;
  command: string;
}

interface HookMatcher {
  matcher: string;
  hooks: HookEntry[];
}

interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface ClaudeSettings {
  hooks?: Record<string, HookMatcher[]>;
  mcpServers?: Record<string, McpServerEntry>;
  [key: string]: unknown;
}

export function findKizunaBin(): { bin: string; found: boolean } {
  try {
    const result = execSync("which kizuna", { encoding: "utf-8" }).trim();
    if (result) return { bin: "kizuna", found: true };
  } catch {
    // not in PATH — fall through to dev path
  }
  const cliJs = resolve(fileURLToPath(import.meta.url), "..", "..", "cli.js");
  if (existsSync(cliJs)) {
    return { bin: `node ${cliJs}`, found: true };
  }
  return { bin: "kizuna", found: false };
}

function findMcpServerPath(): string {
  const mcpMainJs = resolve(
    fileURLToPath(import.meta.url),
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

export function registerSetup(program: Command): void {
  program
    .command("setup")
    .description("Configure Claude Code hooks for the current project")
    .option("--cwd <path>", "Project directory", process.cwd())
    .option("--with-mcp", "Also configure MCP server in settings")
    .action((opts: { cwd: string; withMcp?: boolean }) => {
      const cwd = resolve(opts.cwd);
      const claudeDir = resolve(cwd, ".claude");
      const settingsPath = resolve(claudeDir, "settings.json");
      const kizunaDir = resolve(cwd, ".kizuna");
      const { bin, found: binFound } = findKizunaBin();

      if (!binFound) {
        console.warn(
          "Warning: kizuna binary was not found in PATH or as a dev build.\n" +
            "  Suggestion: run `npm install -g @kizuna/cli` or check your installation.\n" +
            "  Hooks were registered but may fail at runtime.",
        );
      }

      if (!existsSync(claudeDir)) {
        mkdirSync(claudeDir, { recursive: true });
      }

      if (!existsSync(kizunaDir)) {
        mkdirSync(kizunaDir, { recursive: true });
      }

      const pluginsJsonPath = resolve(kizunaDir, "plugins.json");
      let pluginsJsonCreated = false;
      if (!existsSync(pluginsJsonPath)) {
        const template = {
          plugins: {},
        };
        writeFileSync(pluginsJsonPath, JSON.stringify(template, null, 2) + "\n");
        pluginsJsonCreated = true;
      }

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
          m.hooks.some(
            (h) => h.command.includes("kizuna hook") || h.command.includes("cli.js hook"),
          ),
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
        const dbPath = resolve(kizunaDir, "memory.db");

        if (!settings.mcpServers) {
          settings.mcpServers = {};
        }

        settings.mcpServers["kizuna"] = {
          command: "node",
          args: [mcpServerPath],
          env: {
            KIZUNA_DB_PATH: dbPath,
            KIZUNA_PROJECT_DIR: cwd,
          },
        };
        mcpConfigured = true;
      }

      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");

      const claudeMdPath = resolve(cwd, "CLAUDE.md");
      const injected = injectClaudeMdSection(claudeMdPath);

      deployRecapSkill(claudeDir);

      console.log("Kizuna hooks configured:");
      console.log(`  Settings: ${settingsPath}`);
      console.log(`  Database: ${resolve(kizunaDir, "memory.db")}`);
      console.log("");
      console.log("Hooks registered:");
      console.log("  SessionStart     → show memory stats");
      console.log("  SessionEnd       → capture transcript");
      console.log("  UserPromptSubmit → inject relevant memories");
      console.log("  Stop             → incremental capture");
      if (mcpConfigured) {
        console.log("");
        console.log("MCP server configured:");
        console.log('  Server name: "kizuna"');
        console.log(`  Entry point: ${findMcpServerPath()}`);
      }
      console.log("");
      if (pluginsJsonCreated) {
        console.log(`Plugins config: ${pluginsJsonPath} (created)`);
      } else {
        console.log(`Plugins config: ${pluginsJsonPath} (already exists)`);
      }
      console.log("");
      if (injected) {
        console.log(`CLAUDE.md updated: ${claudeMdPath}`);
      } else {
        console.log("CLAUDE.md: Kizuna section already present, skipped");
      }
      console.log("");
      console.log(`Skill deployed: ${resolve(claudeDir, "commands", "recap.md")}`);
    });
}
