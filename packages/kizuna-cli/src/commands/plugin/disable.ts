import type { Command } from "commander";
import { resolve } from "node:path";
import { findPlugin, findPluginByKey } from "./registry.js";
import { readPluginsJson, writePluginsJson } from "./plugins-json.js";

export function registerDisable(pluginCmd: Command): void {
  pluginCmd
    .command("disable <name>")
    .description("Disable a plugin")
    .option("--cwd <path>", "Project directory", process.cwd())
    .action((name: string, opts: { cwd: string }) => {
      const cwd = resolve(opts.cwd);
      const plugin = findPlugin(name);
      if (!plugin) {
        console.error(`Unknown plugin: ${name}`);
        console.error('Run "kizuna plugin list" to see available plugins.');
        process.exitCode = 1;
        return;
      }

      const config = readPluginsJson(cwd);

      let matchedKey: string | undefined;
      for (const [key, entry] of Object.entries(config.plugins)) {
        if (entry.enabled) {
          const def = findPluginByKey(key);
          if (def?.shortName === name) {
            matchedKey = key;
            break;
          }
        }
      }

      if (!matchedKey) {
        console.log(`${name} is not currently enabled`);
        return;
      }

      config.plugins[matchedKey]!.enabled = false;
      writePluginsJson(cwd, config);

      console.log(`${name} disabled`);
    });
}
