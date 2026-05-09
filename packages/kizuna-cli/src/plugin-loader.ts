import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import type { Database, Plugin, PluginConfig, Logger } from "@kizuna/core";
import { PluginManager } from "@kizuna/core";

export interface PluginEntryConfig {
  enabled: boolean;
  options?: Record<string, unknown>;
}

export interface PluginsFileConfig {
  plugins: Record<string, PluginEntryConfig>;
}

const stderrLogger: Logger = {
  debug() {},
  info() {},
  warn(message) {
    process.stderr.write(`kizuna: warn: ${message}\n`);
  },
  error(message) {
    process.stderr.write(`kizuna: error: ${message}\n`);
  },
};

function isPlugin(value: unknown): value is Plugin {
  return (
    typeof value === "object" &&
    value !== null &&
    "name" in value &&
    typeof (value as Record<string, unknown>).name === "string" &&
    "version" in value &&
    typeof (value as Record<string, unknown>).version === "string"
  );
}

export function resolvePluginFromModule(
  mod: Record<string, unknown>,
  options: Record<string, unknown>,
): Plugin | null {
  for (const [key, value] of Object.entries(mod)) {
    if (typeof value === "function" && /^create\w+Plugin$/.test(key)) {
      return (value as (opts: Record<string, unknown>) => Plugin)(options);
    }
  }

  for (const value of Object.values(mod)) {
    if (isPlugin(value)) {
      return value;
    }
  }

  return null;
}

export function readPluginsConfig(cwd: string): PluginsFileConfig | null {
  const configPath = join(cwd, ".kizuna", "plugins.json");
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(configPath, "utf-8")) as PluginsFileConfig;
  } catch {
    stderrLogger.warn("Failed to parse .kizuna/plugins.json");
    return null;
  }
}

function resolvePackageEntry(packageName: string, baseDir: string): string | null {
  const packageDir = join(baseDir, "node_modules", packageName);
  const packageJsonPath = join(packageDir, "package.json");

  if (!existsSync(packageJsonPath)) {
    return null;
  }

  try {
    const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8")) as Record<string, unknown>;
    const exports = pkg.exports as Record<string, unknown> | string | undefined;

    if (exports) {
      let entry: string | undefined;
      if (typeof exports === "string") {
        entry = exports;
      } else {
        const dot = exports["."] as Record<string, string> | string | undefined;
        if (typeof dot === "string") {
          entry = dot;
        } else if (dot) {
          entry = dot.import ?? dot.default;
        }
      }
      if (entry) {
        return join(packageDir, entry);
      }
    }

    if (typeof pkg.main === "string") {
      return join(packageDir, pkg.main);
    }

    return join(packageDir, "index.js");
  } catch {
    return null;
  }
}

async function importPlugin(packageName: string, cwd: string): Promise<Record<string, unknown>> {
  try {
    return (await import(packageName)) as Record<string, unknown>;
  } catch {
    // Fall through to cwd-based resolution
  }

  const entryPath = resolvePackageEntry(packageName, cwd);
  if (entryPath) {
    return (await import(pathToFileURL(entryPath).href)) as Record<string, unknown>;
  }

  throw new Error(`Cannot resolve "${packageName}" from CLI or from ${cwd}/node_modules`);
}

export async function loadPluginManager(
  db: Database,
  cwd: string,
): Promise<PluginManager | undefined> {
  const config = readPluginsConfig(cwd);
  if (!config?.plugins || Object.keys(config.plugins).length === 0) {
    return undefined;
  }

  const enabledPlugins = Object.entries(config.plugins).filter(([, conf]) => conf.enabled);
  if (enabledPlugins.length === 0) {
    return undefined;
  }

  const manager = new PluginManager({
    db: db.db,
    projectConfig: { id: basename(cwd) },
    logger: stderrLogger,
  });

  for (const [packageName, pluginConf] of enabledPlugins) {
    try {
      const mod = await importPlugin(packageName, cwd);
      const plugin = resolvePluginFromModule(mod, pluginConf.options ?? {});

      if (!plugin) {
        stderrLogger.warn(`No plugin export found in "${packageName}"`);
        continue;
      }

      const pluginConfig: PluginConfig = {
        enabled: true,
        options: pluginConf.options ?? {},
      };

      manager.register(plugin, pluginConfig);
    } catch (err) {
      stderrLogger.error(
        `Failed to load plugin "${packageName}": ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  if (manager.getPlugins().length === 0) {
    return undefined;
  }

  await manager.initAll();
  return manager;
}
