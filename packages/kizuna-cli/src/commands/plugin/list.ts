import type { Command } from "commander";
import { PLUGIN_REGISTRY, findPluginByKey } from "./registry.js";
import { readPluginsJson } from "./plugins-json.js";

export function registerList(pluginCmd: Command): void {
  pluginCmd
    .command("list")
    .description("List available plugins")
    .option("--cwd <path>", "Project directory", process.cwd())
    .action((opts: { cwd: string }) => {
      const config = readPluginsJson(opts.cwd);

      const enabledShortNames = new Set<string>();
      for (const [key, entry] of Object.entries(config.plugins)) {
        if (entry.enabled) {
          const def = findPluginByKey(key);
          if (def) enabledShortNames.add(def.shortName);
        }
      }

      console.log("Available plugins:");
      for (const plugin of PLUGIN_REGISTRY) {
        const mark = enabledShortNames.has(plugin.shortName) ? "*" : " ";
        const name = plugin.shortName.padEnd(22);
        console.log(`  ${mark} ${name}${plugin.description}`);
      }

      console.log("");
      if (enabledShortNames.size === 0) {
        console.log("Enabled in this project: (none)");
      } else {
        console.log(`Enabled in this project: ${[...enabledShortNames].join(", ")}`);
      }
    });
}
