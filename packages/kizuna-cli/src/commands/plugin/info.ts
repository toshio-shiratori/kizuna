import type { Command } from "commander";
import { findPlugin } from "./registry.js";

export function registerInfo(pluginCmd: Command): void {
  pluginCmd
    .command("info <name>")
    .description("Show plugin details")
    .action((name: string) => {
      const plugin = findPlugin(name);
      if (!plugin) {
        console.error(`Unknown plugin: ${name}`);
        console.error('Run "kizuna plugin list" to see available plugins.');
        process.exitCode = 1;
        return;
      }

      console.log(plugin.packageName);
      console.log(`  ${plugin.detail}`);
      console.log("");
      console.log("  Setup:");
      console.log(`    ${plugin.example}`);

      if (plugin.options.length > 0) {
        console.log("");
        console.log("  Options:");
        for (const opt of plugin.options) {
          const req = opt.required ? " (required)" : "";
          const def =
            opt.defaultValue !== undefined ? ` (default: ${String(opt.defaultValue)})` : "";
          console.log(`    ${opt.flag.padEnd(22)}${opt.description}${req}${def}`);
        }
      }
    });
}
