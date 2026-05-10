import type { Plugin, RawChunk, PluginContext } from "@kizuna/core";

export const examplePlugin: Plugin = {
  name: "kizuna-plugin-example",
  version: "0.1.0",
  description: "Example Kizuna plugin",

  beforeCapture(chunk: RawChunk, ctx: PluginContext): RawChunk | null {
    ctx.logger.info(`Processing chunk from session ${chunk.sessionId}`);
    return chunk;
  },
};
