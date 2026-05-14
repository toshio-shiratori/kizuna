import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { runCli, createTempDir, removeTempDir } from "../../test-utils.js";
import { resolvePluginDistPath, PLUGIN_REGISTRY, findPluginByKey } from "../plugin/registry.js";

function distKey(shortName: string): string {
  const def = PLUGIN_REGISTRY.find((p) => p.shortName === shortName)!;
  return resolvePluginDistPath(def);
}

describe("plugin command", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  describe("plugin list", () => {
    it("should list all available plugins", () => {
      const result = runCli(`plugin list --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Available plugins:");
      expect(result.stdout).toContain("pii-sanitizer");
      expect(result.stdout).toContain("multi-repo-sharing");
      expect(result.stdout).toContain("hybrid-search");
      expect(result.stdout).toContain("openapi-awareness");
    });

    it("should show (none) when no plugins are enabled", () => {
      const result = runCli(`plugin list --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Enabled in this project: (none)");
    });

    it("should mark enabled plugins (dist path key)", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(
        join(kizunaDir, "plugins.json"),
        JSON.stringify({
          plugins: {
            [distKey("pii-sanitizer")]: { enabled: true },
          },
        }),
      );

      const result = runCli(`plugin list --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("* pii-sanitizer");
      expect(result.stdout).toContain("Enabled in this project: pii-sanitizer");
    });

    it("should recognize legacy package-name keys", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(
        join(kizunaDir, "plugins.json"),
        JSON.stringify({
          plugins: {
            "@kizuna/plugin-pii-sanitizer": { enabled: true },
          },
        }),
      );

      const result = runCli(`plugin list --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("* pii-sanitizer");
    });

    it("should not mark disabled plugins", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(
        join(kizunaDir, "plugins.json"),
        JSON.stringify({
          plugins: {
            [distKey("pii-sanitizer")]: { enabled: false },
          },
        }),
      );

      const result = runCli(`plugin list --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Enabled in this project: (none)");
    });
  });

  describe("plugin info", () => {
    it("should show plugin details", () => {
      const result = runCli("plugin info openapi-awareness", tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("@kizuna/plugin-openapi-awareness");
      expect(result.stdout).toContain("Setup:");
      expect(result.stdout).toContain("kizuna plugin enable openapi-awareness --spec");
      expect(result.stdout).toContain("Options:");
      expect(result.stdout).toContain("--spec <path>");
      expect(result.stdout).toContain("--max-results <n>");
    });

    it("should show plugin info for pii-sanitizer (no options)", () => {
      const result = runCli("plugin info pii-sanitizer", tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("@kizuna/plugin-pii-sanitizer");
      expect(result.stdout).toContain("Setup:");
      expect(result.stdout).not.toContain("Options:");
    });

    it("should error on unknown plugin", () => {
      const result = runCli("plugin info nonexistent", tempDir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("Unknown plugin: nonexistent");
    });
  });

  describe("plugin enable", () => {
    it("should enable pii-sanitizer", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(join(kizunaDir, "plugins.json"), JSON.stringify({ plugins: {} }));

      const result = runCli(`plugin enable pii-sanitizer --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("pii-sanitizer enabled");

      const config = JSON.parse(readFileSync(join(kizunaDir, "plugins.json"), "utf-8"));
      expect(config.plugins[distKey("pii-sanitizer")]).toEqual({
        enabled: true,
      });
    });

    it("should enable openapi-awareness with --spec", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(join(kizunaDir, "plugins.json"), JSON.stringify({ plugins: {} }));

      const result = runCli(
        `plugin enable openapi-awareness --spec ./docs/api.yaml --cwd ${tempDir}`,
        tempDir,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("openapi-awareness enabled");

      const config = JSON.parse(readFileSync(join(kizunaDir, "plugins.json"), "utf-8"));
      const entry = config.plugins[distKey("openapi-awareness")];
      expect(entry.enabled).toBe(true);
      expect(entry.options.specPath).toContain("docs/api.yaml");
      expect(entry.options.specPath).toMatch(/^\//);
    });

    it("should enable multi-repo-sharing with --namespace", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(join(kizunaDir, "plugins.json"), JSON.stringify({ plugins: {} }));

      const result = runCli(
        `plugin enable multi-repo-sharing --namespace my-team --cwd ${tempDir}`,
        tempDir,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("multi-repo-sharing enabled");

      const config = JSON.parse(readFileSync(join(kizunaDir, "plugins.json"), "utf-8"));
      expect(config.plugins[distKey("multi-repo-sharing")]).toEqual({
        enabled: true,
        options: { namespace: "my-team" },
      });
    });

    it("should enable hybrid-search with --alpha", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(join(kizunaDir, "plugins.json"), JSON.stringify({ plugins: {} }));

      const result = runCli(`plugin enable hybrid-search --alpha 0.7 --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("hybrid-search enabled");

      const config = JSON.parse(readFileSync(join(kizunaDir, "plugins.json"), "utf-8"));
      expect(config.plugins[distKey("hybrid-search")]).toEqual({
        enabled: true,
        options: { alpha: 0.7 },
      });
    });

    it("should preserve existing plugin entries when enabling a new one", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(
        join(kizunaDir, "plugins.json"),
        JSON.stringify({
          plugins: {
            [distKey("pii-sanitizer")]: { enabled: true },
          },
        }),
      );

      const result = runCli(
        `plugin enable multi-repo-sharing --namespace test --cwd ${tempDir}`,
        tempDir,
      );
      expect(result.exitCode).toBe(0);

      const config = JSON.parse(readFileSync(join(kizunaDir, "plugins.json"), "utf-8"));
      expect(config.plugins[distKey("pii-sanitizer")]).toEqual({ enabled: true });
      expect(config.plugins[distKey("multi-repo-sharing")]).toEqual({
        enabled: true,
        options: { namespace: "test" },
      });
    });

    it("should create .kizuna directory if it does not exist", () => {
      const result = runCli(`plugin enable pii-sanitizer --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("pii-sanitizer enabled");

      expect(existsSync(join(tempDir, ".kizuna", "plugins.json"))).toBe(true);
      const config = JSON.parse(readFileSync(join(tempDir, ".kizuna", "plugins.json"), "utf-8"));
      expect(config.plugins[distKey("pii-sanitizer")]).toEqual({
        enabled: true,
      });
    });

    it("should error on unknown plugin", () => {
      const result = runCli(`plugin enable nonexistent --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("Unknown plugin: nonexistent");
    });

    it("should error when required option is missing", () => {
      const result = runCli(`plugin enable openapi-awareness --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("Missing required option: --spec");
    });

    it("should remove legacy key when enabling with new key", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(
        join(kizunaDir, "plugins.json"),
        JSON.stringify({
          plugins: {
            "@kizuna/plugin-pii-sanitizer": { enabled: true },
          },
        }),
      );

      const result = runCli(`plugin enable pii-sanitizer --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);

      const config = JSON.parse(readFileSync(join(kizunaDir, "plugins.json"), "utf-8"));
      expect(config.plugins["@kizuna/plugin-pii-sanitizer"]).toBeUndefined();
      expect(config.plugins[distKey("pii-sanitizer")]).toEqual({ enabled: true });
    });
  });

  describe("plugin disable", () => {
    it("should disable an enabled plugin", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(
        join(kizunaDir, "plugins.json"),
        JSON.stringify({
          plugins: {
            [distKey("pii-sanitizer")]: { enabled: true },
          },
        }),
      );

      const result = runCli(`plugin disable pii-sanitizer --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("pii-sanitizer disabled");

      const config = JSON.parse(readFileSync(join(kizunaDir, "plugins.json"), "utf-8"));
      expect(config.plugins[distKey("pii-sanitizer")].enabled).toBe(false);
    });

    it("should disable plugin with legacy package-name key", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(
        join(kizunaDir, "plugins.json"),
        JSON.stringify({
          plugins: {
            "@kizuna/plugin-pii-sanitizer": { enabled: true },
          },
        }),
      );

      const result = runCli(`plugin disable pii-sanitizer --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("pii-sanitizer disabled");

      const config = JSON.parse(readFileSync(join(kizunaDir, "plugins.json"), "utf-8"));
      expect(config.plugins["@kizuna/plugin-pii-sanitizer"].enabled).toBe(false);
    });

    it("should report when plugin is not enabled", () => {
      const result = runCli(`plugin disable pii-sanitizer --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("pii-sanitizer is not currently enabled");
    });

    it("should preserve other plugin entries when disabling", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(
        join(kizunaDir, "plugins.json"),
        JSON.stringify({
          plugins: {
            [distKey("pii-sanitizer")]: { enabled: true },
            [distKey("multi-repo-sharing")]: {
              enabled: true,
              options: { namespace: "team" },
            },
          },
        }),
      );

      const result = runCli(`plugin disable pii-sanitizer --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);

      const config = JSON.parse(readFileSync(join(kizunaDir, "plugins.json"), "utf-8"));
      expect(config.plugins[distKey("pii-sanitizer")].enabled).toBe(false);
      expect(config.plugins[distKey("multi-repo-sharing")]).toEqual({
        enabled: true,
        options: { namespace: "team" },
      });
    });

    it("should error on unknown plugin", () => {
      const result = runCli(`plugin disable nonexistent --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("Unknown plugin: nonexistent");
    });
  });

  describe("findPluginByKey", () => {
    it("should match by package name", () => {
      const result = findPluginByKey("@kizuna/plugin-pii-sanitizer");
      expect(result?.shortName).toBe("pii-sanitizer");
    });

    it("should match by dist path containing dirName", () => {
      const result = findPluginByKey(
        "/Users/toshio/github/kizuna/packages/plugin-pii-sanitizer/dist/index.js",
      );
      expect(result?.shortName).toBe("pii-sanitizer");
    });

    it("should return undefined for unknown key", () => {
      expect(findPluginByKey("unknown-package")).toBeUndefined();
    });
  });
});
