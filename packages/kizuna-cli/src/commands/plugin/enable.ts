import type { Command } from "commander";
import { resolve } from "node:path";
import { findPlugin, findPluginByKey, resolvePluginDistPath } from "./registry.js";
import { readPluginsJson, writePluginsJson } from "./plugins-json.js";

export function registerEnable(pluginCmd: Command): void {
  pluginCmd
    .command("enable <name>")
    .description("Enable a plugin")
    .option("--cwd <path>", "Project directory", process.cwd())
    .option("--spec <path>", "OpenAPI spec file path")
    .option("--namespace <name>", "Namespace for multi-repo sharing")
    .option("--alpha <number>", "Balance between FTS5 and vector (0.0-1.0)")
    .option("--max-results <n>", "Maximum number of matched endpoints")
    .allowUnknownOption(false)
    .action((name: string, opts: Record<string, string | undefined>) => {
      const cwd = resolve(opts.cwd ?? process.cwd());
      const plugin = findPlugin(name);
      if (!plugin) {
        console.error(`Unknown plugin: ${name}`);
        console.error('Run "kizuna plugin list" to see available plugins.');
        process.exitCode = 1;
        return;
      }

      const missingRequired = plugin.options
        .filter((o) => o.required)
        .filter((o) => {
          const flagName = o.flag.match(/--(\S+)/)?.[1] ?? "";
          const camelCase = flagName.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
          return opts[camelCase] === undefined;
        });

      if (missingRequired.length > 0) {
        const flags = missingRequired.map((o) => o.flag.split(" ")[0]).join(", ");
        console.error(`Missing required option: ${flags}`);
        console.error(`  Example: ${plugin.example}`);
        process.exitCode = 1;
        return;
      }

      const options: Record<string, unknown> = {};

      if (name === "openapi-awareness") {
        if (opts.spec) {
          options.specPath = resolve(cwd, opts.spec);
        }
        if (opts.maxResults !== undefined) {
          options.maxResults = Number(opts.maxResults);
        }
      } else if (name === "multi-repo-sharing") {
        if (opts.namespace !== undefined) {
          console.error(
            'Warning: --namespace is deprecated. Use "kizuna plugin config multi-repo-sharing add-reference <name> <path>" instead.',
          );
          options.namespace = opts.namespace;
        }
      } else if (name === "hybrid-search") {
        if (opts.alpha !== undefined) {
          options.alpha = Number(opts.alpha);
        }
      }

      const distPath = resolvePluginDistPath(plugin);
      const config = readPluginsJson(cwd);

      for (const key of Object.keys(config.plugins)) {
        if (key !== distPath && findPluginByKey(key)?.shortName === name) {
          delete config.plugins[key];
        }
      }

      const existingOptions = config.plugins[distPath]?.options;
      const mergedOptions =
        Object.keys(options).length > 0 ? { ...existingOptions, ...options } : existingOptions;

      config.plugins[distPath] = {
        enabled: true,
        ...(mergedOptions && Object.keys(mergedOptions).length > 0
          ? { options: mergedOptions }
          : {}),
      };
      writePluginsJson(cwd, config);

      console.log(`${name} enabled`);
    });
}
