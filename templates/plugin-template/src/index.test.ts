import { describe, it, expect } from "vitest";
import type { RawChunk, PluginContext, Logger } from "@kizuna/core";
import { examplePlugin } from "./index.js";

function makeChunk(content: string): RawChunk {
  return {
    sessionId: "test-session",
    turnIndex: 0,
    role: "assistant",
    content,
    metadata: {},
  };
}

function makeContext(options: Record<string, unknown> = {}): PluginContext {
  const logs: Array<{ level: string; message: string }> = [];
  const logger: Logger = {
    debug(msg) {
      logs.push({ level: "debug", message: msg });
    },
    info(msg) {
      logs.push({ level: "info", message: msg });
    },
    warn(msg) {
      logs.push({ level: "warn", message: msg });
    },
    error(msg) {
      logs.push({ level: "error", message: msg });
    },
  };

  return {
    db: {},
    config: { enabled: true, options },
    projectConfig: { id: "test-project" },
    logger,
    storage: {
      async get() {
        return null;
      },
      async set() {},
      async delete() {},
      async list() {
        return [];
      },
    },
  };
}

describe("examplePlugin", () => {
  it("has correct metadata", () => {
    expect(examplePlugin.name).toBe("kizuna-plugin-example");
    expect(examplePlugin.version).toBe("0.1.0");
    expect(examplePlugin.description).toBeDefined();
  });

  it("passes through chunks in beforeCapture", () => {
    const chunk = makeChunk("test content");
    const ctx = makeContext();
    const result = examplePlugin.beforeCapture!(chunk, ctx);
    expect(result).toEqual(chunk);
  });

  it("does not mutate the original chunk", () => {
    const chunk = makeChunk("test content");
    const original = { ...chunk };
    examplePlugin.beforeCapture!(chunk, makeContext());
    expect(chunk).toEqual(original);
  });
});
