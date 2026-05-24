import { resolve } from "node:path";
import { Database, loadPluginManager, readPluginsConfig } from "@kizuna/core";
import type { Logger } from "@kizuna/core";

const consoleLogger: Logger = {
  debug() {},
  info(message) {
    console.log(message);
  },
  warn(message) {
    console.warn(message);
  },
  error(message) {
    console.error(message);
  },
};

export interface MigrationResult {
  ran: boolean;
  pluginCount: number;
  failedCount: number;
}

export async function runPluginMigrationsForProject(
  cwd: string,
  options?: { silent?: boolean },
): Promise<MigrationResult> {
  const config = readPluginsConfig(cwd);
  if (!config?.plugins || Object.keys(config.plugins).length === 0) {
    return { ran: false, pluginCount: 0, failedCount: 0 };
  }

  const enabledCount = Object.values(config.plugins).filter((p) => p.enabled).length;
  if (enabledCount === 0) {
    return { ran: false, pluginCount: 0, failedCount: 0 };
  }

  const dbPath = resolve(cwd, ".kizuna", "memory.db");
  const db = new Database(dbPath);
  try {
    const logger = options?.silent ? undefined : { logger: consoleLogger };
    const manager = await loadPluginManager(db.getConnection(), cwd, logger);
    if (!manager) {
      return { ran: false, pluginCount: 0, failedCount: 0 };
    }

    const entries = manager.getPlugins();
    const pluginCount = entries.length;
    const failedCount = entries.filter((e) => e.initFailed).length;
    await manager.shutdownAll();
    return { ran: true, pluginCount, failedCount };
  } catch (err) {
    console.error(`Plugin migration error: ${err instanceof Error ? err.message : String(err)}`);
    return { ran: false, pluginCount: 0, failedCount: 0 };
  } finally {
    db.close();
  }
}
