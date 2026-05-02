import type { Command } from "commander";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

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
        settings = JSON.parse(
          readFileSync(settingsPath, "utf-8"),
        ) as ClaudeSettings;
      }

      if (!settings.hooks) {
        settings.hooks = {};
      }

      const hooks = settings.hooks;

      const kizunaHooks = {
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
      };

      for (const [event, config] of Object.entries(kizunaHooks)) {
        if (!hooks[event]) {
          hooks[event] = [];
        }

        const existing = hooks[event]!.find((m) =>
          m.hooks.some((h) => h.command.startsWith(`${bin} hook`)),
        );

        if (!existing) {
          hooks[event]!.push({
            matcher: config.matcher,
            hooks: [config.hook],
          });
        }
      }

      writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");

      console.log("Kizuna hooks configured:");
      console.log(`  Settings: ${settingsPath}`);
      console.log(`  Database: ${resolve(kizunaDir, "memory.db")}`);
      console.log("");
      console.log("Hooks registered:");
      console.log("  SessionEnd       → capture transcript");
      console.log("  UserPromptSubmit → inject relevant memories");
    });
}
