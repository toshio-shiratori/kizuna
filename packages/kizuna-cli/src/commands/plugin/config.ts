import type { Command } from "commander";
import { resolve, join } from "node:path";
import { existsSync, statSync } from "node:fs";
import { findPlugin, findPluginByKey, resolvePluginDistPath } from "./registry.js";
import { readPluginsJson, writePluginsJson } from "./plugins-json.js";

interface Reference {
  name: string;
  dbPath: string;
}

interface PluginEntryInfo {
  key: string;
  options: Record<string, unknown>;
}

function findPluginEntry(cwd: string, pluginName: string): PluginEntryInfo | null {
  const plugin = findPlugin(pluginName);
  if (!plugin) {
    return null;
  }

  const config = readPluginsJson(cwd);
  const distPath = resolvePluginDistPath(plugin);

  // Check dist path key first
  const distEntry = config.plugins[distPath];
  if (distEntry !== undefined && distEntry.enabled) {
    return { key: distPath, options: distEntry.options ?? {} };
  }

  // Check all keys for a match
  for (const key of Object.keys(config.plugins)) {
    const matched = findPluginByKey(key);
    const entry = config.plugins[key];
    if (entry !== undefined && matched?.shortName === pluginName && entry.enabled) {
      return { key, options: entry.options ?? {} };
    }
  }

  return null;
}

export function registerConfig(pluginCmd: Command): void {
  const configCmd = pluginCmd
    .command("config <plugin-name> <subcommand> [args...]")
    .description("Manage plugin options")
    .option("--cwd <path>", "Project directory", process.cwd())
    .action((pluginName: string, subcommand: string, args: string[], opts: { cwd?: string }) => {
      const cwd = resolve(opts.cwd ?? process.cwd());

      const plugin = findPlugin(pluginName);
      if (!plugin) {
        console.error(`Unknown plugin: ${pluginName}`);
        console.error('Run "kizuna plugin list" to see available plugins.');
        process.exitCode = 1;
        return;
      }

      const entry = findPluginEntry(cwd, pluginName);
      if (!entry) {
        console.error(
          `Plugin "${pluginName}" is not enabled. Run "kizuna plugin enable ${pluginName}" first.`,
        );
        process.exitCode = 1;
        return;
      }

      switch (subcommand) {
        case "add-reference":
          handleAddReference(cwd, entry, args);
          break;
        case "remove-reference":
          handleRemoveReference(cwd, entry, args);
          break;
        case "list-references":
          handleListReferences(entry);
          break;
        case "set":
          handleSet(cwd, entry, args);
          break;
        default:
          console.error(`Unknown subcommand: ${subcommand}`);
          console.error(
            "Available subcommands: add-reference, remove-reference, list-references, set",
          );
          process.exitCode = 1;
      }
    });

  configCmd.addHelpText(
    "after",
    `
Subcommands:
  add-reference <name> <path>   Add or update a reference
  remove-reference <name>       Remove a reference by name
  list-references               List all references
  set <key> <value>             Set a scalar option`,
  );
}

/**
 * Resolves a user-provided path to a valid database file path.
 *
 * Resolution rules:
 * - If the path is a directory, append `.kizuna/memory.db` automatically.
 * - If the path is a file, use it as-is (regardless of filename).
 * - If the resolved path does not exist, return an error.
 * - If the original path does not exist at all, return an error.
 */
function resolveReferencePath(
  cwd: string,
  rawPath: string,
): { dbPath: string; resolved: boolean } | { error: string } {
  const absPath = resolve(cwd, rawPath);

  let isDir: boolean;
  try {
    isDir = statSync(absPath).isDirectory();
  } catch {
    // Path does not exist at all
    return { error: `Path does not exist: ${absPath}` };
  }

  if (!isDir) {
    // It's a file — use as-is
    return { dbPath: absPath, resolved: false };
  }

  // It's a directory — auto-resolve to .kizuna/memory.db
  const dbPath = join(absPath, ".kizuna", "memory.db");
  if (!existsSync(dbPath)) {
    return {
      error: `Database not found: ${dbPath} (directory given, but .kizuna/memory.db does not exist)`,
    };
  }
  return { dbPath, resolved: true };
}

function handleAddReference(cwd: string, entry: PluginEntryInfo, args: string[]): void {
  const name = args[0] as string | undefined;
  const rawPath = args[1] as string | undefined;

  if (!name || !rawPath) {
    console.error("Usage: kizuna plugin config <plugin> add-reference <name> <path>");
    process.exitCode = 1;
    return;
  }

  const result = resolveReferencePath(cwd, rawPath);
  if ("error" in result) {
    console.error(result.error);
    process.exitCode = 1;
    return;
  }

  const { dbPath, resolved } = result;

  const references: Reference[] = Array.isArray(entry.options.references)
    ? ([...entry.options.references] as Reference[])
    : [];

  const existingIndex = references.findIndex((r) => r.name === name);
  if (existingIndex >= 0) {
    references[existingIndex] = { name, dbPath };
  } else {
    references.push({ name, dbPath });
  }

  const config = readPluginsJson(cwd);
  config.plugins[entry.key] = {
    enabled: true,
    options: { ...entry.options, references },
  };
  writePluginsJson(cwd, config);

  if (resolved) {
    console.log(`Reference "${name}" added. (resolved: ${dbPath})`);
  } else {
    console.log(`Reference "${name}" added.`);
  }
}

function handleRemoveReference(cwd: string, entry: PluginEntryInfo, args: string[]): void {
  const name = args[0] as string | undefined;

  if (!name) {
    console.error("Usage: kizuna plugin config <plugin> remove-reference <name>");
    process.exitCode = 1;
    return;
  }

  const references: Reference[] = Array.isArray(entry.options.references)
    ? ([...entry.options.references] as Reference[])
    : [];

  const existingIndex = references.findIndex((r) => r.name === name);
  if (existingIndex < 0) {
    console.error(`Reference "${name}" not found.`);
    process.exitCode = 1;
    return;
  }

  references.splice(existingIndex, 1);

  const config = readPluginsJson(cwd);
  config.plugins[entry.key] = {
    enabled: true,
    options: { ...entry.options, references },
  };
  writePluginsJson(cwd, config);

  console.log(`Reference "${name}" removed.`);
}

function handleListReferences(entry: PluginEntryInfo): void {
  const references: Reference[] = Array.isArray(entry.options.references)
    ? (entry.options.references as Reference[])
    : [];

  if (references.length === 0) {
    console.log("(none)");
    return;
  }

  for (const ref of references) {
    console.log(`${ref.name}\t${ref.dbPath}`);
  }
}

function handleSet(cwd: string, entry: PluginEntryInfo, args: string[]): void {
  const key = args[0] as string | undefined;
  const rawValue = args[1] as string | undefined;

  if (!key || rawValue === undefined) {
    console.error("Usage: kizuna plugin config <plugin> set <key> <value>");
    process.exitCode = 1;
    return;
  }

  const numValue = Number(rawValue);
  const value: string | number = !isNaN(numValue) && rawValue.trim() !== "" ? numValue : rawValue;

  const config = readPluginsJson(cwd);
  const newOptions: Record<string, unknown> = { ...entry.options };
  newOptions[key] = value;
  config.plugins[entry.key] = {
    enabled: true,
    options: newOptions,
  };
  writePluginsJson(cwd, config);

  console.log(`Set "${key}" = ${JSON.stringify(value)}`);
}
