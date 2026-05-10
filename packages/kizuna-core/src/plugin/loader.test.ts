import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { readPluginsConfig, resolvePluginFromModule } from "./loader.js";

describe("resolvePluginFromModule", () => {
  it("finds a factory function matching createXxxPlugin pattern", () => {
    const mod = {
      createTestPlugin: (opts: Record<string, unknown>) => ({
        name: "test-plugin",
        version: "1.0.0",
        alpha: opts.alpha,
      }),
    };
    const result = resolvePluginFromModule(mod, { alpha: 0.7 });
    expect(result).toMatchObject({ name: "test-plugin", alpha: 0.7 });
  });

  it("falls back to a Plugin object export when no factory exists", () => {
    const mod = {
      myPlugin: { name: "plain-plugin", version: "2.0.0" },
    };
    const result = resolvePluginFromModule(mod, {});
    expect(result).toEqual(mod.myPlugin);
  });

  it("prefers factory over plain Plugin export", () => {
    const mod = {
      plainPlugin: { name: "plain", version: "1.0.0" },
      createFooPlugin: () => ({ name: "factory", version: "1.0.0" }),
    };
    const result = resolvePluginFromModule(mod, {});
    expect(result?.name).toBe("factory");
  });

  it("returns null when no plugin is found", () => {
    const mod = { someUtil: () => {} };
    expect(resolvePluginFromModule(mod, {})).toBeNull();
  });

  it("rejects objects missing required Plugin fields", () => {
    const mod = { notAPlugin: { foo: "bar" } };
    expect(resolvePluginFromModule(mod, {})).toBeNull();
  });
});

describe("readPluginsConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "kizuna-loader-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns null when .kizuna/plugins.json does not exist", () => {
    expect(readPluginsConfig(tempDir)).toBeNull();
  });

  it("parses valid config", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    const config = {
      plugins: {
        "@kizuna/plugin-pii-sanitizer": { enabled: true, options: {} },
        "@kizuna/plugin-hybrid-search": { enabled: false, options: { alpha: 0.5 } },
      },
    };
    writeFileSync(join(kizunaDir, "plugins.json"), JSON.stringify(config));
    expect(readPluginsConfig(tempDir)).toEqual(config);
  });

  it("returns null for invalid JSON", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    writeFileSync(join(kizunaDir, "plugins.json"), "not-json{");
    expect(readPluginsConfig(tempDir)).toBeNull();
  });
});
