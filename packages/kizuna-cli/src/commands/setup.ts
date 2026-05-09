import type { Command } from "commander";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

interface ClaudeSettings {
  hooks?: Record<string, HookMatcher[]>;
  [key: string]: unknown;
}

function findKizunaBin(): string {
  try {
    const result = execSync("which kizuna", { encoding: "utf-8" }).trim();
    if (result) return "kizuna";
  } catch {
    // not in PATH — fall through to dev path
  }
  const cliJs = resolve(fileURLToPath(import.meta.url), "..", "..", "cli.js");
  if (existsSync(cliJs)) {
    return `node ${cliJs}`;
  }
  return "kizuna";
}

export function registerSetup(program: Command): void {
  program
    .command("setup")
    .description("Configure Claude Code hooks for the current project")
    .option("--cwd <path>", "Project directory", process.cwd())
    .action((opts: { cwd: string }) => {
      const cwd = resolve(opts.cwd);
      const claudeDir = resolve(cwd, ".claude");
      const settingsPath = resolve(claudeDir, "settings.json");
      const kizunaDir = resolve(cwd, ".kizuna");
      const bin = findKizunaBin();

      if (!existsSync(claudeDir)) {
        mkdirSync(claudeDir, { recursive: true });
      }

      if (!existsSync(kizunaDir)) {
        mkdirSync(kizunaDir, { recursive: true });
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

      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");

      const claudeMdPath = resolve(cwd, "CLAUDE.md");
      const injected = injectClaudeMdSection(claudeMdPath);

      console.log("Kizuna hooks configured:");
      console.log(`  Settings: ${settingsPath}`);
      console.log(`  Database: ${resolve(kizunaDir, "memory.db")}`);
      console.log("");
      console.log("Hooks registered:");
      console.log("  SessionStart     → show memory stats");
      console.log("  SessionEnd       → capture transcript");
      console.log("  UserPromptSubmit → inject relevant memories");
      console.log("  Stop             → incremental capture");
      console.log("");
      if (injected) {
        console.log(`CLAUDE.md updated: ${claudeMdPath}`);
      } else {
        console.log("CLAUDE.md: Kizuna section already present, skipped");
      }
    });
}
