import type { Plugin, ContextInjection, PluginContext } from "@kizuna/core";
import { loadSpec, parseEndpoints, type EndpointInfo } from "./parser.js";
import { matchEndpoints } from "./matcher.js";
import { formatEndpoints } from "./formatter.js";

export type {
  EndpointInfo,
  ParameterInfo,
  RequestBodyInfo,
  ResponseInfo,
  PropertyInfo,
} from "./parser.js";
export type { MatchResult } from "./matcher.js";
export { loadSpec, parseEndpoints } from "./parser.js";
export { matchEndpoints } from "./matcher.js";
export { formatEndpoints } from "./formatter.js";

export interface OpenAPIAwarenessOptions {
  specPath?: string;
  specPaths?: string[];
  maxResults?: number;
}

const PLUGIN_NAME = "@kizuna/plugin-openapi-awareness";
const DEFAULT_MAX_RESULTS = 5;

function resolveSpecPaths(options: OpenAPIAwarenessOptions): string[] {
  const paths: string[] = [];
  if (options.specPaths) {
    paths.push(...options.specPaths);
  }
  if (options.specPath && !paths.includes(options.specPath)) {
    paths.push(options.specPath);
  }
  return paths;
}

export function createOpenAPIAwareness(): Plugin {
  let cachedEndpoints: readonly EndpointInfo[] | null = null;

  return {
    name: PLUGIN_NAME,
    version: "0.0.0",
    description: "Injects relevant OpenAPI endpoint information into context based on user queries",

    init(ctx: PluginContext): void {
      const options = ctx.config.options as OpenAPIAwarenessOptions;
      const paths = resolveSpecPaths(options);
      if (paths.length === 0) {
        ctx.logger.warn("No specPath/specPaths configured, plugin will be inactive");
        return;
      }

      const allEndpoints: EndpointInfo[] = [];
      for (const specPath of paths) {
        try {
          const spec = loadSpec(specPath);
          const endpoints = parseEndpoints(spec);
          allEndpoints.push(...endpoints);
          ctx.logger.info("Loaded OpenAPI spec", {
            endpointCount: endpoints.length,
            specPath,
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          ctx.logger.error("Failed to load OpenAPI spec", {
            specPath,
            error: message,
          });
        }
      }

      cachedEndpoints = allEndpoints.length > 0 ? allEndpoints : null;
    },

    shutdown(): void {
      cachedEndpoints = null;
    },

    enrichContext(injection: ContextInjection, ctx: PluginContext): ContextInjection {
      if (!cachedEndpoints || cachedEndpoints.length === 0) {
        return injection;
      }

      const options = ctx.config.options as OpenAPIAwarenessOptions;
      const maxResults = options.maxResults ?? DEFAULT_MAX_RESULTS;

      const matches = matchEndpoints(injection.userPrompt, cachedEndpoints, maxResults);

      if (matches.length === 0) {
        return injection;
      }

      const content = formatEndpoints(matches);
      ctx.logger.info("Injecting API endpoint context", {
        matchCount: matches.length,
        endpoints: matches.map((m) => `${m.endpoint.method} ${m.endpoint.path}`),
      });

      return {
        ...injection,
        contextBlocks: [
          ...injection.contextBlocks,
          {
            source: PLUGIN_NAME,
            priority: 50,
            content,
          },
        ],
      };
    },
  };
}

export const openapiAwareness: Plugin = createOpenAPIAwareness();
