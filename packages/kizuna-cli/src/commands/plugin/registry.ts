import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface PluginOptionDef {
  flag: string;
  description: string;
  required?: boolean;
  defaultValue?: string | number;
}

export interface PluginDef {
  shortName: string;
  packageName: string;
  dirName: string;
  description: string;
  detail: string;
  options: PluginOptionDef[];
  example: string;
}

export const PLUGIN_REGISTRY: readonly PluginDef[] = [
  {
    shortName: "pii-sanitizer",
    packageName: "@kizuna/plugin-pii-sanitizer",
    dirName: "plugin-pii-sanitizer",
    description: "API key / secret auto-masking",
    detail: "API key, token, secret etc. are auto-redacted before storage.",
    options: [],
    example: "kizuna plugin enable pii-sanitizer",
  },
  {
    shortName: "multi-repo-sharing",
    packageName: "@kizuna/plugin-multi-repo-sharing",
    dirName: "plugin-multi-repo-sharing",
    description: "Share memories across repositories",
    detail: "Enable cross-repository memory search via federated queries.",
    options: [
      {
        flag: "--namespace <name>",
        description: "Namespace for shared memories (deprecated)",
        required: false,
      },
    ],
    example: "kizuna plugin enable multi-repo-sharing",
  },
  {
    shortName: "hybrid-search",
    packageName: "@kizuna/plugin-hybrid-search",
    dirName: "plugin-hybrid-search",
    description: "FTS5 + vector hybrid search",
    detail: "Combine FTS5 lexical search with vector similarity for better recall.",
    options: [
      {
        flag: "--alpha <number>",
        description: "Balance between FTS5 and vector (0.0-1.0)",
        required: false,
        defaultValue: 0.5,
      },
    ],
    example: "kizuna plugin enable hybrid-search --alpha 0.7",
  },
  {
    shortName: "openapi-awareness",
    packageName: "@kizuna/plugin-openapi-awareness",
    dirName: "plugin-openapi-awareness",
    description: "Inject OpenAPI endpoint info into context",
    detail: "Inject relevant OpenAPI endpoint information into context based on the conversation.",
    options: [
      {
        flag: "--spec <path>",
        description: "Path to OpenAPI spec file (required)",
        required: true,
      },
      {
        flag: "--max-results <n>",
        description: "Maximum number of matched endpoints",
        required: false,
        defaultValue: 5,
      },
    ],
    example: "kizuna plugin enable openapi-awareness --spec ./docs/openapi/api.yaml",
  },
] as const;

export function findPlugin(name: string): PluginDef | undefined {
  return PLUGIN_REGISTRY.find((p) => p.shortName === name);
}

export function resolvePluginDistPath(plugin: PluginDef): string {
  const cliDir = resolve(fileURLToPath(import.meta.url), "..", "..", "..");
  return resolve(cliDir, "..", plugin.dirName, "dist", "index.js");
}

export function findPluginByKey(key: string): PluginDef | undefined {
  return PLUGIN_REGISTRY.find((p) => p.packageName === key || key.includes(`/${p.dirName}/`));
}
