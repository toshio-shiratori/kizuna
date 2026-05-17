import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { createTempDir, removeTempDir } from "../../test-utils.js";
import { resolvePluginDistPath, PLUGIN_REGISTRY } from "./registry.js";

function distKey(shortName: string): string {
  const def = PLUGIN_REGISTRY.find((p) => p.shortName === shortName)!;
  return resolvePluginDistPath(def);
}

const mockPluginManager = {
  getPlugins: vi.fn(),
  shutdownAll: vi.fn(),
};

vi.mock("@kizuna/core", async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    loadPluginManager: vi.fn(),
  };
});

const { runPluginMigrationsForProject } = await import("./run-migrations.js");
const { loadPluginManager } = await import("@kizuna/core");
const mockedLoadPluginManager = vi.mocked(loadPluginManager);

describe("runPluginMigrationsForProject", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
    vi.clearAllMocks();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  it("should return ran=false when no plugins.json exists", async () => {
    const result = await runPluginMigrationsForProject(tempDir);
    expect(result).toEqual({ ran: false, pluginCount: 0, failedCount: 0 });
    expect(mockedLoadPluginManager).not.toHaveBeenCalled();
  });

  it("should return ran=false when plugins.json has no plugins", async () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    writeFileSync(join(kizunaDir, "plugins.json"), JSON.stringify({ plugins: {} }));

    const result = await runPluginMigrationsForProject(tempDir);
    expect(result).toEqual({ ran: false, pluginCount: 0, failedCount: 0 });
    expect(mockedLoadPluginManager).not.toHaveBeenCalled();
  });

  it("should return ran=false when all plugins are disabled", async () => {
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

    const result = await runPluginMigrationsForProject(tempDir);
    expect(result).toEqual({ ran: false, pluginCount: 0, failedCount: 0 });
    expect(mockedLoadPluginManager).not.toHaveBeenCalled();
  });

  it("should run migrations for enabled plugins and create memory.db", async () => {
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

    mockPluginManager.getPlugins.mockReturnValue([{ plugin: { name: "test" }, initFailed: false }]);
    mockPluginManager.shutdownAll.mockResolvedValue(undefined);
    mockedLoadPluginManager.mockResolvedValue(
      mockPluginManager as unknown as ReturnType<typeof loadPluginManager> extends Promise<infer T>
        ? NonNullable<T>
        : never,
    );

    const result = await runPluginMigrationsForProject(tempDir, { silent: true });
    expect(result.ran).toBe(true);
    expect(result.pluginCount).toBe(1);
    expect(result.failedCount).toBe(0);
    expect(existsSync(join(kizunaDir, "memory.db"))).toBe(true);
    expect(mockedLoadPluginManager).toHaveBeenCalledOnce();
    expect(mockPluginManager.shutdownAll).toHaveBeenCalledOnce();
  });

  it("should report failedCount when plugins have initFailed", async () => {
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

    mockPluginManager.getPlugins.mockReturnValue([
      { plugin: { name: "ok-plugin" }, initFailed: false },
      { plugin: { name: "bad-plugin" }, initFailed: true },
    ]);
    mockPluginManager.shutdownAll.mockResolvedValue(undefined);
    mockedLoadPluginManager.mockResolvedValue(
      mockPluginManager as unknown as ReturnType<typeof loadPluginManager> extends Promise<infer T>
        ? NonNullable<T>
        : never,
    );

    const result = await runPluginMigrationsForProject(tempDir, { silent: true });
    expect(result.ran).toBe(true);
    expect(result.pluginCount).toBe(2);
    expect(result.failedCount).toBe(1);
  });

  it("should return ran=false when loadPluginManager returns undefined", async () => {
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

    mockedLoadPluginManager.mockResolvedValue(undefined);

    const result = await runPluginMigrationsForProject(tempDir, { silent: true });
    expect(result.ran).toBe(false);
    expect(result.pluginCount).toBe(0);
  });

  it("should use console logger when not silent", async () => {
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

    mockPluginManager.getPlugins.mockReturnValue([{ plugin: { name: "test" }, initFailed: false }]);
    mockPluginManager.shutdownAll.mockResolvedValue(undefined);
    mockedLoadPluginManager.mockResolvedValue(
      mockPluginManager as unknown as ReturnType<typeof loadPluginManager> extends Promise<infer T>
        ? NonNullable<T>
        : never,
    );

    await runPluginMigrationsForProject(tempDir);
    expect(mockedLoadPluginManager).toHaveBeenCalledWith(
      expect.anything(),
      tempDir,
      expect.objectContaining({ logger: expect.any(Object) }),
    );
  });

  it("should pass undefined logger when silent", async () => {
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

    mockedLoadPluginManager.mockResolvedValue(undefined);

    await runPluginMigrationsForProject(tempDir, { silent: true });
    expect(mockedLoadPluginManager).toHaveBeenCalledWith(expect.anything(), tempDir, undefined);
  });

  it("should log error and return ran=false on exception", async () => {
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

    mockedLoadPluginManager.mockRejectedValue(new Error("boom"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const result = await runPluginMigrationsForProject(tempDir, { silent: true });
    expect(result).toEqual({ ran: false, pluginCount: 0, failedCount: 0 });
    expect(errorSpy).toHaveBeenCalledWith("Plugin migration error: boom");

    errorSpy.mockRestore();
  });
});
