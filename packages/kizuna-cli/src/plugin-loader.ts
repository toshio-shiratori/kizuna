import type { Database, Plugin, Logger } from "@kizuna/core";
import { loadPluginManager as coreLoadPluginManager } from "@kizuna/core";
export { readPluginsConfig, resolvePluginFromModule } from "@kizuna/core";

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

export type HookCategory = "capture" | "search";

export function hasHooksForCategory(plugin: Plugin, category: HookCategory): boolean {
  if (category === "capture") {
    return !!(plugin.beforeCapture || plugin.afterCapture);
  }
  return !!(plugin.beforeSearch || plugin.afterSearch || plugin.enrichContext);
}

export async function loadPluginManager(db: Database, cwd: string, hookCategory?: HookCategory) {
  return coreLoadPluginManager(db.getConnection(), cwd, {
    logger: stderrLogger,
    filterPlugin: hookCategory ? (plugin) => hasHooksForCategory(plugin, hookCategory) : undefined,
  });
}
