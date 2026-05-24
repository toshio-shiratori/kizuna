import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Database } from "@kizuna/core";
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

    it("should enable multi-repo-sharing with --namespace and show deprecation warning", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(join(kizunaDir, "plugins.json"), JSON.stringify({ plugins: {} }));

      const result = runCli(
        `plugin enable multi-repo-sharing --namespace my-team --cwd ${tempDir}`,
        tempDir,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("multi-repo-sharing enabled");
      expect(result.stderr).toContain("Warning: --namespace is deprecated");
      expect(result.stderr).toContain("kizuna plugin config multi-repo-sharing add-reference");

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

    it("should preserve existing options when re-enabling without flags", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(
        join(kizunaDir, "plugins.json"),
        JSON.stringify({
          plugins: {
            [distKey("multi-repo-sharing")]: {
              enabled: true,
              options: {
                references: [{ name: "backend", dbPath: "/path/to/db" }],
                halfLifeDays: 14,
              },
            },
          },
        }),
      );

      const result = runCli(`plugin enable multi-repo-sharing --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);

      const config = JSON.parse(readFileSync(join(kizunaDir, "plugins.json"), "utf-8"));
      const entry = config.plugins[distKey("multi-repo-sharing")];
      expect(entry.enabled).toBe(true);
      expect(entry.options.references).toEqual([{ name: "backend", dbPath: "/path/to/db" }]);
      expect(entry.options.halfLifeDays).toBe(14);
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

  describe("plugin config", () => {
    it("should error when plugin is not enabled", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(join(kizunaDir, "plugins.json"), JSON.stringify({ plugins: {} }));

      const result = runCli(
        `plugin config multi-repo-sharing list-references --cwd ${tempDir}`,
        tempDir,
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain(
        'Plugin "multi-repo-sharing" is not enabled. Run "kizuna plugin enable multi-repo-sharing" first.',
      );
    });

    it("should add a reference with directory path auto-resolved to .kizuna/memory.db", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(
        join(kizunaDir, "plugins.json"),
        JSON.stringify({
          plugins: { [distKey("multi-repo-sharing")]: { enabled: true } },
        }),
      );

      // Create a target project directory with .kizuna/memory.db
      const targetDir = join(tempDir, "other-project");
      const targetKizuna = join(targetDir, ".kizuna");
      mkdirSync(targetKizuna, { recursive: true });
      writeFileSync(join(targetKizuna, "memory.db"), "");

      const result = runCli(
        `plugin config multi-repo-sharing add-reference backend ${targetDir} --cwd ${tempDir}`,
        tempDir,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Reference "backend" added.');
      expect(result.stdout).toContain("(resolved:");

      const config = JSON.parse(readFileSync(join(kizunaDir, "plugins.json"), "utf-8"));
      const refs = config.plugins[distKey("multi-repo-sharing")].options.references;
      expect(refs).toHaveLength(1);
      expect(refs[0].name).toBe("backend");
      expect(refs[0].dbPath).toBe(join(targetKizuna, "memory.db"));
    });

    it("should update existing reference by name", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(
        join(kizunaDir, "plugins.json"),
        JSON.stringify({
          plugins: {
            [distKey("multi-repo-sharing")]: {
              enabled: true,
              options: { references: [{ name: "backend", dbPath: "/old/path" }] },
            },
          },
        }),
      );

      // Create a target project directory with .kizuna/memory.db
      const targetDir = join(tempDir, "other-project");
      const targetKizuna = join(targetDir, ".kizuna");
      mkdirSync(targetKizuna, { recursive: true });
      writeFileSync(join(targetKizuna, "memory.db"), "");

      const result = runCli(
        `plugin config multi-repo-sharing add-reference backend ${targetDir} --cwd ${tempDir}`,
        tempDir,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Reference "backend" added.');

      const config = JSON.parse(readFileSync(join(kizunaDir, "plugins.json"), "utf-8"));
      const refs = config.plugins[distKey("multi-repo-sharing")].options.references;
      expect(refs).toHaveLength(1);
      expect(refs[0].dbPath).toBe(join(targetKizuna, "memory.db"));
    });

    it("should error on non-existent path", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(
        join(kizunaDir, "plugins.json"),
        JSON.stringify({
          plugins: { [distKey("multi-repo-sharing")]: { enabled: true } },
        }),
      );

      const result = runCli(
        `plugin config multi-repo-sharing add-reference backend /nonexistent/path/db --cwd ${tempDir}`,
        tempDir,
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Path does not exist:");

      // Verify plugins.json was NOT modified
      const config = JSON.parse(readFileSync(join(kizunaDir, "plugins.json"), "utf-8"));
      expect(config.plugins[distKey("multi-repo-sharing")].options).toBeUndefined();
    });

    it("should use direct DB file path as-is when given a file", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(
        join(kizunaDir, "plugins.json"),
        JSON.stringify({
          plugins: { [distKey("multi-repo-sharing")]: { enabled: true } },
        }),
      );

      // Create a file path directly
      const dbFile = join(tempDir, "other-project", ".kizuna", "memory.db");
      mkdirSync(join(tempDir, "other-project", ".kizuna"), { recursive: true });
      writeFileSync(dbFile, "");

      const result = runCli(
        `plugin config multi-repo-sharing add-reference backend ${dbFile} --cwd ${tempDir}`,
        tempDir,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Reference "backend" added.');
      // Should NOT show "(resolved:" since no auto-resolution happened
      expect(result.stdout).not.toContain("(resolved:");

      const config = JSON.parse(readFileSync(join(kizunaDir, "plugins.json"), "utf-8"));
      const refs = config.plugins[distKey("multi-repo-sharing")].options.references;
      expect(refs).toHaveLength(1);
      expect(refs[0].dbPath).toBe(dbFile);
    });

    it("should error when directory has no .kizuna/memory.db", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(
        join(kizunaDir, "plugins.json"),
        JSON.stringify({
          plugins: { [distKey("multi-repo-sharing")]: { enabled: true } },
        }),
      );

      // Create a target directory WITHOUT .kizuna/memory.db
      const targetDir = join(tempDir, "empty-project");
      mkdirSync(targetDir, { recursive: true });

      const result = runCli(
        `plugin config multi-repo-sharing add-reference backend ${targetDir} --cwd ${tempDir}`,
        tempDir,
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain("Database not found:");
      expect(result.stderr).toContain(".kizuna/memory.db does not exist");

      // Verify plugins.json was NOT modified
      const config = JSON.parse(readFileSync(join(kizunaDir, "plugins.json"), "utf-8"));
      expect(config.plugins[distKey("multi-repo-sharing")].options).toBeUndefined();
    });

    it("should remove a reference by name", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(
        join(kizunaDir, "plugins.json"),
        JSON.stringify({
          plugins: {
            [distKey("multi-repo-sharing")]: {
              enabled: true,
              options: {
                references: [
                  { name: "backend", dbPath: "/path/a" },
                  { name: "frontend", dbPath: "/path/b" },
                ],
              },
            },
          },
        }),
      );

      const result = runCli(
        `plugin config multi-repo-sharing remove-reference backend --cwd ${tempDir}`,
        tempDir,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Reference "backend" removed.');

      const config = JSON.parse(readFileSync(join(kizunaDir, "plugins.json"), "utf-8"));
      const refs = config.plugins[distKey("multi-repo-sharing")].options.references;
      expect(refs).toHaveLength(1);
      expect(refs[0].name).toBe("frontend");
    });

    it("should error when removing a non-existent reference", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(
        join(kizunaDir, "plugins.json"),
        JSON.stringify({
          plugins: {
            [distKey("multi-repo-sharing")]: {
              enabled: true,
              options: { references: [] },
            },
          },
        }),
      );

      const result = runCli(
        `plugin config multi-repo-sharing remove-reference nonexistent --cwd ${tempDir}`,
        tempDir,
      );
      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Reference "nonexistent" not found.');
    });

    it("should list current references", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(
        join(kizunaDir, "plugins.json"),
        JSON.stringify({
          plugins: {
            [distKey("multi-repo-sharing")]: {
              enabled: true,
              options: {
                references: [
                  { name: "backend", dbPath: "/path/to/backend/memory.db" },
                  { name: "frontend", dbPath: "/path/to/frontend/memory.db" },
                ],
              },
            },
          },
        }),
      );

      const result = runCli(
        `plugin config multi-repo-sharing list-references --cwd ${tempDir}`,
        tempDir,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("backend\t/path/to/backend/memory.db");
      expect(result.stdout).toContain("frontend\t/path/to/frontend/memory.db");
    });

    it("should show (none) when references are empty", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(
        join(kizunaDir, "plugins.json"),
        JSON.stringify({
          plugins: {
            [distKey("multi-repo-sharing")]: { enabled: true },
          },
        }),
      );

      const result = runCli(
        `plugin config multi-repo-sharing list-references --cwd ${tempDir}`,
        tempDir,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("(none)");
    });

    it("should set a scalar value", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(
        join(kizunaDir, "plugins.json"),
        JSON.stringify({
          plugins: { [distKey("multi-repo-sharing")]: { enabled: true } },
        }),
      );

      const result = runCli(
        `plugin config multi-repo-sharing set halfLifeDays 30 --cwd ${tempDir}`,
        tempDir,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Set "halfLifeDays" = 30');

      const config = JSON.parse(readFileSync(join(kizunaDir, "plugins.json"), "utf-8"));
      expect(config.plugins[distKey("multi-repo-sharing")].options.halfLifeDays).toBe(30);
    });

    it("should convert numeric strings to numbers", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(
        join(kizunaDir, "plugins.json"),
        JSON.stringify({
          plugins: { [distKey("multi-repo-sharing")]: { enabled: true } },
        }),
      );

      const result = runCli(
        `plugin config multi-repo-sharing set alpha 0.7 --cwd ${tempDir}`,
        tempDir,
      );
      expect(result.exitCode).toBe(0);

      const config = JSON.parse(readFileSync(join(kizunaDir, "plugins.json"), "utf-8"));
      expect(config.plugins[distKey("multi-repo-sharing")].options.alpha).toBe(0.7);
    });

    it("should keep string values that are not numeric", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(
        join(kizunaDir, "plugins.json"),
        JSON.stringify({
          plugins: { [distKey("multi-repo-sharing")]: { enabled: true } },
        }),
      );

      const result = runCli(
        `plugin config multi-repo-sharing set namespace my-team --cwd ${tempDir}`,
        tempDir,
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Set "namespace" = "my-team"');

      const config = JSON.parse(readFileSync(join(kizunaDir, "plugins.json"), "utf-8"));
      expect(config.plugins[distKey("multi-repo-sharing")].options.namespace).toBe("my-team");
    });
  });

  describe("plugin enable (migration)", () => {
    it("should run migrations after enabling a plugin", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(join(kizunaDir, "plugins.json"), JSON.stringify({ plugins: {} }));

      const result = runCli(`plugin enable pii-sanitizer --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("pii-sanitizer enabled");
      expect(result.stdout).toContain("Plugin migrations executed successfully.");
    });

    it("should run migrations on re-enable without errors", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(join(kizunaDir, "plugins.json"), JSON.stringify({ plugins: {} }));

      const first = runCli(`plugin enable pii-sanitizer --cwd ${tempDir}`, tempDir);
      expect(first.exitCode).toBe(0);
      expect(first.stdout).toContain("Plugin migrations executed successfully.");

      const second = runCli(`plugin enable pii-sanitizer --cwd ${tempDir}`, tempDir);
      expect(second.exitCode).toBe(0);
      expect(second.stdout).toContain("pii-sanitizer enabled");
      expect(second.stdout).toContain("Plugin migrations executed successfully.");
    });
  });

  describe("plugin enable (hybrid-search migration)", () => {
    it("should create hybrid_search_embeddings table on enable", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(join(kizunaDir, "plugins.json"), JSON.stringify({ plugins: {} }));

      const result = runCli(`plugin enable hybrid-search --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("hybrid-search enabled");
      expect(result.stdout).toContain("Plugin migrations executed successfully.");

      const dbPath = join(kizunaDir, "memory.db");
      expect(existsSync(dbPath)).toBe(true);

      const db = new Database(dbPath, { readonly: true });
      try {
        const tables = db
          .getConnection()
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='hybrid_search_embeddings'",
          )
          .all() as { name: string }[];
        expect(tables).toHaveLength(1);

        const versions = db
          .getConnection()
          .prepare(
            "SELECT component, version FROM schema_versions WHERE component='@kizuna/plugin-hybrid-search'",
          )
          .all() as { component: string; version: number }[];
        expect(versions.length).toBeGreaterThanOrEqual(1);
      } finally {
        db.close();
      }
    });
  });

  describe("plugin init (hybrid-search migration)", () => {
    it("should create hybrid_search_embeddings table via init", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(
        join(kizunaDir, "plugins.json"),
        JSON.stringify({
          plugins: {
            [distKey("hybrid-search")]: { enabled: true },
          },
        }),
      );

      const result = runCli(`plugin init --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Plugin migrations complete.");

      const dbPath = join(kizunaDir, "memory.db");
      const db = new Database(dbPath, { readonly: true });
      try {
        const tables = db
          .getConnection()
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='hybrid_search_embeddings'",
          )
          .all() as { name: string }[];
        expect(tables).toHaveLength(1);
      } finally {
        db.close();
      }
    });
  });

  describe("plugin init", () => {
    it("should run migrations for enabled plugins", () => {
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

      const result = runCli(`plugin init --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Plugin migrations complete. 1 plugin(s) initialized.");
    });

    it("should report when no plugins are enabled", () => {
      const kizunaDir = join(tempDir, ".kizuna");
      mkdirSync(kizunaDir, { recursive: true });
      writeFileSync(join(kizunaDir, "plugins.json"), JSON.stringify({ plugins: {} }));

      const result = runCli(`plugin init --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("No enabled plugins found. Nothing to do.");
    });

    it("should report when no plugins.json exists", () => {
      const result = runCli(`plugin init --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("No enabled plugins found. Nothing to do.");
    });

    it("should handle disabled plugins gracefully", () => {
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

      const result = runCli(`plugin init --cwd ${tempDir}`, tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("No enabled plugins found. Nothing to do.");
    });

    it("should be idempotent on repeated runs", () => {
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

      const first = runCli(`plugin init --cwd ${tempDir}`, tempDir);
      expect(first.exitCode).toBe(0);
      expect(first.stdout).toContain("Plugin migrations complete. 1 plugin(s) initialized.");

      const second = runCli(`plugin init --cwd ${tempDir}`, tempDir);
      expect(second.exitCode).toBe(0);
      expect(second.stdout).toContain("Plugin migrations complete. 1 plugin(s) initialized.");
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

  describe("registry completeness", () => {
    it("should have an entry for every plugin-* package in the monorepo", () => {
      const packagesDir = resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..", "..");
      const pluginDirs = readdirSync(packagesDir).filter((d) => d.startsWith("plugin-"));
      const registeredDirNames = PLUGIN_REGISTRY.map((p) => p.dirName);

      for (const dir of pluginDirs) {
        expect(
          registeredDirNames,
          `plugin package "${dir}" is missing from PLUGIN_REGISTRY`,
        ).toContain(dir);
      }
    });
  });
});
