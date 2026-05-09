import type {
  Plugin,
  RawChunk,
  SearchQuery,
  SearchResult,
  PluginContext,
  Migration,
} from "@kizuna/core";

export interface MultiRepoSharingOptions {
  namespace?: string;
}

const PLUGIN_NAME = "@kizuna/plugin-multi-repo-sharing";

export const multiRepoSharing: Plugin = {
  name: PLUGIN_NAME,
  version: "0.0.0",
  description: "Enables memory sharing across repositories via namespaces",

  migrations(): Migration[] {
    return [
      {
        version: 1,
        description: "Add index for namespace queries",
        up: `
          CREATE INDEX IF NOT EXISTS idx_chunks_metadata_namespace
            ON chunks(json_extract(metadata, '$."${PLUGIN_NAME}".namespace'));
        `,
        down: `DROP INDEX IF EXISTS idx_chunks_metadata_namespace;`,
      },
    ];
  },

  beforeCapture(chunk: RawChunk, ctx: PluginContext): RawChunk {
    const options = ctx.config.options as MultiRepoSharingOptions;
    return {
      ...chunk,
      metadata: {
        ...chunk.metadata,
        [PLUGIN_NAME]: {
          repoId: ctx.projectConfig.id,
          namespace: options.namespace ?? null,
        },
      },
    };
  },

  beforeSearch(query: SearchQuery, ctx: PluginContext): SearchQuery {
    const options = ctx.config.options as MultiRepoSharingOptions;
    const namespaces = [ctx.projectConfig.id];
    if (options.namespace) {
      namespaces.push(options.namespace);
    }
    return {
      ...query,
      filters: {
        ...query.filters,
        namespaces,
      },
    };
  },

  afterSearch(results: SearchResult[]): SearchResult[] {
    return results.map((result) => {
      const pluginMeta = (result.chunk.metadata as Record<string, unknown>)[PLUGIN_NAME];
      const isShared =
        pluginMeta !== null &&
        pluginMeta !== undefined &&
        typeof pluginMeta === "object" &&
        "namespace" in pluginMeta &&
        pluginMeta.namespace !== null;

      return {
        ...result,
        annotations: {
          ...result.annotations,
          isShared,
        },
      };
    });
  },
};
