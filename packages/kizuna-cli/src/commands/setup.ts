import type { Command } from "commander";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { injectClaudeMdSection } from "./setup/claude-md.js";
import { deployRecapSkill, deploySessionStartSkill } from "./setup/skills.js";
import { configureHooks, findMcpServerPath } from "./setup/hooks.js";
import { runPluginMigrationsForProject } from "./plugin/run-migrations.js";

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

export function registerSetup(program: Command): void {
  program
    .command("setup")
    .description("Configure Claude Code hooks for the current project")
    .option("--cwd <path>", "Project directory", process.cwd())
    .option("--with-mcp", "Also configure MCP server in settings")
    .action(async (opts: { cwd: string; withMcp?: boolean }) => {
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

      const { mcpConfigured } = configureHooks(settingsPath, bin, {
        withMcp: opts.withMcp,
        cwd,
        kizunaDir,
      });

      const claudeMdPath = resolve(cwd, "CLAUDE.md");
      const injected = injectClaudeMdSection(claudeMdPath);

      const recapResult = deployRecapSkill(claudeDir);
      const sessionStartResult = deploySessionStartSkill(claudeDir);

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
      const recapPath = resolve(claudeDir, "commands", "recap.md");
      console.log(
        recapResult === "created" ? `Skill deployed: ${recapPath}` : `Skill updated: ${recapPath}`,
      );
      const sessionStartPath = resolve(claudeDir, "commands", "session-start.md");
      console.log(
        sessionStartResult === "created"
          ? `Skill deployed: ${sessionStartPath}`
          : `Skill skipped: ${sessionStartPath} (already exists)`,
      );

      if (!pluginsJsonCreated) {
        const migrationResult = await runPluginMigrationsForProject(cwd, { silent: true });
        if (migrationResult.ran) {
          console.log("");
          if (migrationResult.failedCount > 0) {
            console.error(
              `Plugin migrations: ${migrationResult.failedCount} of ${migrationResult.pluginCount} plugin(s) failed.`,
            );
          } else {
            console.log(`Plugin migrations: ${migrationResult.pluginCount} plugin(s) initialized.`);
          }
        }
      }
    });
}
