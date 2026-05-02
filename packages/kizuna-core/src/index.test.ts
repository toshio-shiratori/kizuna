import { describe, it, expect } from "vitest";
import type { RawChunk, StoredChunk, Plugin } from "./index.js";

describe("kizuna-core types", () => {
  it("should allow creating a RawChunk", () => {
    const chunk: RawChunk = {
      sessionId: "test-session",
      turnIndex: 0,
      role: "user",
      content: "Hello, world!",
      metadata: {},
    };
    expect(chunk.role).toBe("user");
  });

  it("should allow creating a StoredChunk", () => {
    const chunk: StoredChunk = {
      id: 1,
      sessionId: "test-session",
      turnIndex: 0,
      role: "assistant",
      content: "こんにちは",
      tokenCount: 10,
      importance: 5,
      createdAt: "2026-05-02T00:00:00Z",
      metadata: {},
    };
    expect(chunk.id).toBe(1);
    expect(chunk.content).toBe("こんにちは");
  });

  it("should define Plugin interface with optional hooks", () => {
    const plugin: Plugin = {
      name: "test-plugin",
      version: "0.0.1",
    };
    expect(plugin.name).toBe("test-plugin");
    expect(plugin.beforeCapture).toBeUndefined();
  });
});
