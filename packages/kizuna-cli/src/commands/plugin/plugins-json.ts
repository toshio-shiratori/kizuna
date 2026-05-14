import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

interface PluginEntry {
  enabled: boolean;
  options?: Record<string, unknown>;
}

export interface PluginsJson {
  plugins: Record<string, PluginEntry>;
}

function pluginsJsonPath(cwd: string): string {
  return resolve(cwd, ".kizuna", "plugins.json");
}

export function readPluginsJson(cwd: string): PluginsJson {
  const filePath = pluginsJsonPath(cwd);
  if (!existsSync(filePath)) {
    return { plugins: {} };
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as PluginsJson;
  } catch {
    return { plugins: {} };
  }
}

export function writePluginsJson(cwd: string, data: PluginsJson): void {
  const filePath = pluginsJsonPath(cwd);
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n");
}
