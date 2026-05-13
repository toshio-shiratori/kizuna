import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadConfig } from "./loader.js";
import { PIPELINE_DEFAULTS, DISPLAY_DEFAULTS } from "./defaults.js";

describe("loadConfig", () => {
  let tmpDir: string;
  let globalDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "kizuna-config-test-"));
    globalDir = mkdtempSync(join(tmpdir(), "kizuna-global-config-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(globalDir, { recursive: true, force: true });
  });

  it("returns defaults when no config file exists", () => {
    const config = loadConfig(tmpDir, globalDir);
    expect(config.pipeline).toEqual(PIPELINE_DEFAULTS);
    expect(config.display).toEqual(DISPLAY_DEFAULTS);
  });

  it("returns defaults when .kizuna directory exists but no config.json", () => {
    mkdirSync(join(tmpDir, ".kizuna"));
    const config = loadConfig(tmpDir, globalDir);
    expect(config.pipeline).toEqual(PIPELINE_DEFAULTS);
    expect(config.display).toEqual(DISPLAY_DEFAULTS);
  });

  it("overrides pipeline values from config file", () => {
    mkdirSync(join(tmpDir, ".kizuna"));
    writeFileSync(
      join(tmpDir, ".kizuna", "config.json"),
      JSON.stringify({ pipeline: { tokenBudget: 3000, maxResults: 20 } }),
    );

    const config = loadConfig(tmpDir, globalDir);
    expect(config.pipeline.tokenBudget).toBe(3000);
    expect(config.pipeline.maxResults).toBe(20);
    expect(config.pipeline.halfLifeDays).toBe(PIPELINE_DEFAULTS.halfLifeDays);
    expect(config.pipeline.minContentLength).toBe(PIPELINE_DEFAULTS.minContentLength);
  });

  it("overrides display values from config file", () => {
    mkdirSync(join(tmpDir, ".kizuna"));
    writeFileSync(
      join(tmpDir, ".kizuna", "config.json"),
      JSON.stringify({ display: { previewLength: 200, recapChunkLimit: 10 } }),
    );

    const config = loadConfig(tmpDir, globalDir);
    expect(config.display.previewLength).toBe(200);
    expect(config.display.recapChunkLimit).toBe(10);
    expect(config.display.cleanupPreviewLength).toBe(DISPLAY_DEFAULTS.cleanupPreviewLength);
    expect(config.display.cleanupShowLimit).toBe(DISPLAY_DEFAULTS.cleanupShowLimit);
  });

  it("overrides both pipeline and display values", () => {
    mkdirSync(join(tmpDir, ".kizuna"));
    writeFileSync(
      join(tmpDir, ".kizuna", "config.json"),
      JSON.stringify({
        pipeline: { halfLifeDays: 60 },
        display: { cleanupShowLimit: 50 },
      }),
    );

    const config = loadConfig(tmpDir, globalDir);
    expect(config.pipeline.halfLifeDays).toBe(60);
    expect(config.pipeline.tokenBudget).toBe(PIPELINE_DEFAULTS.tokenBudget);
    expect(config.display.cleanupShowLimit).toBe(50);
    expect(config.display.previewLength).toBe(DISPLAY_DEFAULTS.previewLength);
  });

  it("ignores invalid (non-positive) numeric values", () => {
    mkdirSync(join(tmpDir, ".kizuna"));
    writeFileSync(
      join(tmpDir, ".kizuna", "config.json"),
      JSON.stringify({
        pipeline: { tokenBudget: -1, maxResults: 0, halfLifeDays: "abc" },
        display: { previewLength: null },
      }),
    );

    const config = loadConfig(tmpDir, globalDir);
    expect(config.pipeline.tokenBudget).toBe(PIPELINE_DEFAULTS.tokenBudget);
    expect(config.pipeline.maxResults).toBe(PIPELINE_DEFAULTS.maxResults);
    expect(config.pipeline.halfLifeDays).toBe(PIPELINE_DEFAULTS.halfLifeDays);
    expect(config.display.previewLength).toBe(DISPLAY_DEFAULTS.previewLength);
  });

  it("ignores NaN and Infinity values", () => {
    mkdirSync(join(tmpDir, ".kizuna"));
    writeFileSync(
      join(tmpDir, ".kizuna", "config.json"),
      JSON.stringify({
        pipeline: { tokenBudget: "NaN", minContentLength: "Infinity" },
      }),
    );

    const config = loadConfig(tmpDir, globalDir);
    expect(config.pipeline.tokenBudget).toBe(PIPELINE_DEFAULTS.tokenBudget);
    expect(config.pipeline.minContentLength).toBe(PIPELINE_DEFAULTS.minContentLength);
  });

  it("throws on malformed JSON", () => {
    mkdirSync(join(tmpDir, ".kizuna"));
    writeFileSync(join(tmpDir, ".kizuna", "config.json"), "not valid json{");

    expect(() => loadConfig(tmpDir, globalDir)).toThrow(/Failed to parse config file/);
  });

  it("handles empty config file object", () => {
    mkdirSync(join(tmpDir, ".kizuna"));
    writeFileSync(join(tmpDir, ".kizuna", "config.json"), "{}");

    const config = loadConfig(tmpDir, globalDir);
    expect(config.pipeline).toEqual(PIPELINE_DEFAULTS);
    expect(config.display).toEqual(DISPLAY_DEFAULTS);
  });

  it("ignores unknown keys in config", () => {
    mkdirSync(join(tmpDir, ".kizuna"));
    writeFileSync(
      join(tmpDir, ".kizuna", "config.json"),
      JSON.stringify({
        pipeline: { tokenBudget: 5000, unknownKey: true },
        unknownSection: { foo: "bar" },
      }),
    );

    const config = loadConfig(tmpDir, globalDir);
    expect(config.pipeline.tokenBudget).toBe(5000);
    expect(config.pipeline.maxResults).toBe(PIPELINE_DEFAULTS.maxResults);
  });

  it("floors float values to integers for integer-semantics fields", () => {
    mkdirSync(join(tmpDir, ".kizuna"));
    writeFileSync(
      join(tmpDir, ".kizuna", "config.json"),
      JSON.stringify({
        pipeline: { tokenBudget: 2500.9, maxResults: 7.3, minContentLength: 15.7 },
        display: {
          previewLength: 150.5,
          cleanupShowLimit: 25.8,
          recapChunkLimit: 8.2,
          recapMaxContentLength: 750.3,
        },
      }),
    );

    const config = loadConfig(tmpDir, globalDir);
    expect(config.pipeline.tokenBudget).toBe(2500);
    expect(config.pipeline.maxResults).toBe(7);
    expect(config.pipeline.minContentLength).toBe(15);
    expect(config.display.previewLength).toBe(150);
    expect(config.display.cleanupShowLimit).toBe(25);
    expect(config.display.recapChunkLimit).toBe(8);
    expect(config.display.recapMaxContentLength).toBe(750);
  });

  it("allows float for halfLifeDays", () => {
    mkdirSync(join(tmpDir, ".kizuna"));
    writeFileSync(
      join(tmpDir, ".kizuna", "config.json"),
      JSON.stringify({ pipeline: { halfLifeDays: 14.5 } }),
    );

    const config = loadConfig(tmpDir, globalDir);
    expect(config.pipeline.halfLifeDays).toBe(14.5);
  });

  it("overrides recapMaxContentLength from config file", () => {
    mkdirSync(join(tmpDir, ".kizuna"));
    writeFileSync(
      join(tmpDir, ".kizuna", "config.json"),
      JSON.stringify({ display: { recapMaxContentLength: 1000 } }),
    );

    const config = loadConfig(tmpDir, globalDir);
    expect(config.display.recapMaxContentLength).toBe(1000);
  });

  it("overrides listLimit from config file", () => {
    mkdirSync(join(tmpDir, ".kizuna"));
    writeFileSync(
      join(tmpDir, ".kizuna", "config.json"),
      JSON.stringify({ display: { listLimit: 50 } }),
    );

    const config = loadConfig(tmpDir, globalDir);
    expect(config.display.listLimit).toBe(50);
  });

  describe("global config", () => {
    it("applies global config when no project config exists", () => {
      writeFileSync(
        join(globalDir, "config.json"),
        JSON.stringify({ pipeline: { tokenBudget: 4000, maxResults: 15 } }),
      );

      const config = loadConfig(tmpDir, globalDir);
      expect(config.pipeline.tokenBudget).toBe(4000);
      expect(config.pipeline.maxResults).toBe(15);
      expect(config.pipeline.halfLifeDays).toBe(PIPELINE_DEFAULTS.halfLifeDays);
      expect(config.display).toEqual(DISPLAY_DEFAULTS);
    });

    it("applies global display config when no project config exists", () => {
      writeFileSync(
        join(globalDir, "config.json"),
        JSON.stringify({ display: { previewLength: 250, listLimit: 30 } }),
      );

      const config = loadConfig(tmpDir, globalDir);
      expect(config.display.previewLength).toBe(250);
      expect(config.display.listLimit).toBe(30);
      expect(config.display.cleanupPreviewLength).toBe(DISPLAY_DEFAULTS.cleanupPreviewLength);
      expect(config.pipeline).toEqual(PIPELINE_DEFAULTS);
    });

    it("project config overrides global config", () => {
      writeFileSync(
        join(globalDir, "config.json"),
        JSON.stringify({ pipeline: { tokenBudget: 4000, maxResults: 15 } }),
      );

      mkdirSync(join(tmpDir, ".kizuna"));
      writeFileSync(
        join(tmpDir, ".kizuna", "config.json"),
        JSON.stringify({ pipeline: { tokenBudget: 5000 } }),
      );

      const config = loadConfig(tmpDir, globalDir);
      // project config overrides global for tokenBudget
      expect(config.pipeline.tokenBudget).toBe(5000);
      // global config still applies for maxResults (not overridden by project)
      expect(config.pipeline.maxResults).toBe(15);
      // default applies for fields not in either config
      expect(config.pipeline.halfLifeDays).toBe(PIPELINE_DEFAULTS.halfLifeDays);
    });

    it("project config overrides global config for display values", () => {
      writeFileSync(
        join(globalDir, "config.json"),
        JSON.stringify({ display: { previewLength: 250, listLimit: 30 } }),
      );

      mkdirSync(join(tmpDir, ".kizuna"));
      writeFileSync(
        join(tmpDir, ".kizuna", "config.json"),
        JSON.stringify({ display: { previewLength: 300 } }),
      );

      const config = loadConfig(tmpDir, globalDir);
      expect(config.display.previewLength).toBe(300);
      expect(config.display.listLimit).toBe(30);
      expect(config.display.cleanupPreviewLength).toBe(DISPLAY_DEFAULTS.cleanupPreviewLength);
    });

    it("merges global pipeline and project display independently", () => {
      writeFileSync(
        join(globalDir, "config.json"),
        JSON.stringify({ pipeline: { tokenBudget: 4000 } }),
      );

      mkdirSync(join(tmpDir, ".kizuna"));
      writeFileSync(
        join(tmpDir, ".kizuna", "config.json"),
        JSON.stringify({ display: { previewLength: 300 } }),
      );

      const config = loadConfig(tmpDir, globalDir);
      expect(config.pipeline.tokenBudget).toBe(4000);
      expect(config.display.previewLength).toBe(300);
      expect(config.pipeline.maxResults).toBe(PIPELINE_DEFAULTS.maxResults);
      expect(config.display.cleanupPreviewLength).toBe(DISPLAY_DEFAULTS.cleanupPreviewLength);
    });

    it("returns defaults when neither global nor project config exists", () => {
      const config = loadConfig(tmpDir, globalDir);
      expect(config.pipeline).toEqual(PIPELINE_DEFAULTS);
      expect(config.display).toEqual(DISPLAY_DEFAULTS);
    });

    it("ignores invalid values in global config", () => {
      writeFileSync(
        join(globalDir, "config.json"),
        JSON.stringify({
          pipeline: { tokenBudget: -1, maxResults: "abc" },
        }),
      );

      const config = loadConfig(tmpDir, globalDir);
      expect(config.pipeline.tokenBudget).toBe(PIPELINE_DEFAULTS.tokenBudget);
      expect(config.pipeline.maxResults).toBe(PIPELINE_DEFAULTS.maxResults);
    });

    it("throws on malformed global config JSON", () => {
      writeFileSync(join(globalDir, "config.json"), "not valid json{");

      expect(() => loadConfig(tmpDir, globalDir)).toThrow(/Failed to parse config file/);
    });

    it("handles empty global config object", () => {
      writeFileSync(join(globalDir, "config.json"), "{}");

      const config = loadConfig(tmpDir, globalDir);
      expect(config.pipeline).toEqual(PIPELINE_DEFAULTS);
      expect(config.display).toEqual(DISPLAY_DEFAULTS);
    });

    it("uses global config as base when project config has invalid values", () => {
      writeFileSync(
        join(globalDir, "config.json"),
        JSON.stringify({ pipeline: { tokenBudget: 4000 } }),
      );

      mkdirSync(join(tmpDir, ".kizuna"));
      writeFileSync(
        join(tmpDir, ".kizuna", "config.json"),
        JSON.stringify({ pipeline: { tokenBudget: -1 } }),
      );

      const config = loadConfig(tmpDir, globalDir);
      // Invalid project value falls back to global value (which is now the base)
      expect(config.pipeline.tokenBudget).toBe(4000);
    });

    it("applies three-layer merge: defaults < global < project", () => {
      writeFileSync(
        join(globalDir, "config.json"),
        JSON.stringify({
          pipeline: { tokenBudget: 4000, maxResults: 15, halfLifeDays: 45 },
          display: { previewLength: 200, cleanupShowLimit: 30 },
        }),
      );

      mkdirSync(join(tmpDir, ".kizuna"));
      writeFileSync(
        join(tmpDir, ".kizuna", "config.json"),
        JSON.stringify({
          pipeline: { tokenBudget: 5000 },
          display: { cleanupShowLimit: 40, listLimit: 50 },
        }),
      );

      const config = loadConfig(tmpDir, globalDir);
      // From project config (overrides global)
      expect(config.pipeline.tokenBudget).toBe(5000);
      expect(config.display.cleanupShowLimit).toBe(40);
      expect(config.display.listLimit).toBe(50);
      // From global config (not overridden by project)
      expect(config.pipeline.maxResults).toBe(15);
      expect(config.pipeline.halfLifeDays).toBe(45);
      expect(config.display.previewLength).toBe(200);
      // From defaults (not in either config)
      expect(config.pipeline.minContentLength).toBe(PIPELINE_DEFAULTS.minContentLength);
      expect(config.display.cleanupPreviewLength).toBe(DISPLAY_DEFAULTS.cleanupPreviewLength);
      expect(config.display.recapChunkLimit).toBe(DISPLAY_DEFAULTS.recapChunkLimit);
    });
  });
});
