import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdtempSync,
  rmSync,
  mkdirSync,
  writeFileSync,
  existsSync,
  readFileSync,
  symlinkSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { spawnSync } from "node:child_process";
import { Database, captureTranscript } from "@kizuna/core";
import { resolvePluginFromModule, readPluginsConfig } from "./plugin-loader.js";

const TSX_BIN = join(import.meta.dirname, "..", "node_modules", ".bin", "tsx");
const CLI_PATH = join(import.meta.dirname, "cli.ts");
const PACKAGES_DIR = resolve(import.meta.dirname, "..", "..");

function runHook(
  subcommand: string,
  stdinJson: Record<string, unknown>,
): { stdout: string; stderr: string; exitCode: number } {
  const result = spawnSync(TSX_BIN, [CLI_PATH, "hook", subcommand], {
    input: JSON.stringify(stdinJson),
    encoding: "utf-8",
    env: { ...process.env, NODE_NO_WARNINGS: "1" },
  });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    exitCode: result.status ?? 1,
  };
}

function linkPlugin(tempDir: string, pluginName: string): void {
  const scopeDir = join(tempDir, "node_modules", "@kizuna");
  mkdirSync(scopeDir, { recursive: true });
  const shortName = pluginName.replace("@kizuna/", "");
  symlinkSync(join(PACKAGES_DIR, shortName), join(scopeDir, shortName));
}

function createTranscript(dir: string): string {
  const transcriptPath = join(dir, "transcript.jsonl");
  const lines = [
    JSON.stringify({
      type: "summary",
      summary: "Test session",
      session_id: "plugin-test-session",
      timestamp: "2025-01-20T10:00:00Z",
    }),
    JSON.stringify({
      type: "user",
      uuid: "u1",
      message: { role: "user", content: "Test prompt with sk-ant-api03-SECRET-KEY-HERE" },
      timestamp: "2025-01-20T10:01:00Z",
    }),
    JSON.stringify({
      type: "assistant",
      uuid: "a1",
      message: { role: "assistant", content: "I can see you shared a key." },
      timestamp: "2025-01-20T10:02:00Z",
    }),
  ];
  writeFileSync(transcriptPath, lines.join("\n"));
  return transcriptPath;
}

async function seedDatabase(cwd: string): Promise<void> {
  const kizunaDir = join(cwd, ".kizuna");
  mkdirSync(kizunaDir, { recursive: true });
  const db = new Database(join(kizunaDir, "memory.db"));

  await captureTranscript(db, {
    sessionId: "seed-session",
    projectId: "test-project",
    transcriptContent: [
      JSON.stringify({
        type: "summary",
        summary: "Seeded session",
        session_id: "seed-session",
        timestamp: "2025-01-15T10:00:00Z",
      }),
      JSON.stringify({
        type: "user",
        uuid: "u1",
        message: { role: "user", content: "SQLiteのWALモードについて教えてください" },
        timestamp: "2025-01-15T10:01:00Z",
      }),
      JSON.stringify({
        type: "assistant",
        uuid: "a1",
        message: { role: "assistant", content: "WALモードはWrite-Ahead Loggingの略です。" },
        timestamp: "2025-01-15T10:02:00Z",
      }),
    ].join("\n"),
  });

  db.close();
}

describe("resolvePluginFromModule", () => {
  it("should find a Plugin object export", () => {
    const mod = {
      someUtil: () => {},
      myPlugin: { name: "test-plugin", version: "1.0.0", description: "Test" },
    };
    const result = resolvePluginFromModule(mod, {});
    expect(result).toEqual(mod.myPlugin);
  });

  it("should prefer factory function over plain Plugin export", () => {
    const factoryPlugin = { name: "factory-plugin", version: "2.0.0" };
    const mod = {
      plainPlugin: { name: "plain-plugin", version: "1.0.0" },
      createTestPlugin: (opts: Record<string, unknown>) => ({
        ...factoryPlugin,
        description: opts.desc,
      }),
    };
    const result = resolvePluginFromModule(mod, { desc: "from-options" });
    expect(result).toMatchObject({ name: "factory-plugin", description: "from-options" });
  });

  it("should return null when no Plugin is found", () => {
    const mod = {
      utilFunction: () => {},
      someObject: { foo: "bar" },
    };
    const result = resolvePluginFromModule(mod, {});
    expect(result).toBeNull();
  });

  it("should pass options to factory function", () => {
    let receivedOptions: unknown = null;
    const mod = {
      createMyPlugin: (opts: unknown) => {
        receivedOptions = opts;
        return { name: "my-plugin", version: "1.0.0" };
      },
    };
    const options = { alpha: 0.7, model: "test-model" };
    resolvePluginFromModule(mod, options);
    expect(receivedOptions).toEqual(options);
  });
});

describe("readPluginsConfig", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "kizuna-plugin-cfg-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should return null when plugins.json does not exist", () => {
    const result = readPluginsConfig(tempDir);
    expect(result).toBeNull();
  });

  it("should parse valid plugins.json", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    const config = {
      plugins: {
        "@kizuna/plugin-pii-sanitizer": { enabled: true, options: {} },
        "@kizuna/plugin-hybrid-search": { enabled: false, options: { alpha: 0.5 } },
      },
    };
    writeFileSync(join(kizunaDir, "plugins.json"), JSON.stringify(config));

    const result = readPluginsConfig(tempDir);
    expect(result).toEqual(config);
  });

  it("should return null for invalid JSON", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    writeFileSync(join(kizunaDir, "plugins.json"), "not-json{");

    const result = readPluginsConfig(tempDir);
    expect(result).toBeNull();
  });
});

describe("Plugin integration via hooks", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "kizuna-plugin-hook-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("should work without plugins.json (backward compatible)", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    const transcriptPath = createTranscript(tempDir);

    const result = runHook("session-end", {
      session_id: "no-plugin-session",
      transcript_path: transcriptPath,
      cwd: tempDir,
      hook_event_name: "SessionEnd",
    });

    expect(result.exitCode).toBe(0);

    const db = new Database(join(kizunaDir, "memory.db"));
    try {
      const count = (
        db.db.prepare("SELECT COUNT(*) AS count FROM chunks").get() as { count: number }
      ).count;
      expect(count).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });

  it("should work with empty plugins config", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    writeFileSync(join(kizunaDir, "plugins.json"), JSON.stringify({ plugins: {} }));
    const transcriptPath = createTranscript(tempDir);

    const result = runHook("session-end", {
      session_id: "empty-plugin-session",
      transcript_path: transcriptPath,
      cwd: tempDir,
      hook_event_name: "SessionEnd",
    });

    expect(result.exitCode).toBe(0);

    const db = new Database(join(kizunaDir, "memory.db"));
    try {
      const count = (
        db.db.prepare("SELECT COUNT(*) AS count FROM chunks").get() as { count: number }
      ).count;
      expect(count).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });

  it("should gracefully handle unresolvable plugin packages", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    writeFileSync(
      join(kizunaDir, "plugins.json"),
      JSON.stringify({
        plugins: {
          "@kizuna/plugin-nonexistent": { enabled: true, options: {} },
        },
      }),
    );
    const transcriptPath = createTranscript(tempDir);

    const result = runHook("session-end", {
      session_id: "bad-plugin-session",
      transcript_path: transcriptPath,
      cwd: tempDir,
      hook_event_name: "SessionEnd",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).toContain("Failed to load plugin");

    const db = new Database(join(kizunaDir, "memory.db"));
    try {
      const count = (
        db.db.prepare("SELECT COUNT(*) AS count FROM chunks").get() as { count: number }
      ).count;
      expect(count).toBeGreaterThan(0);
    } finally {
      db.close();
    }
  });

  it("should skip disabled plugins", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    writeFileSync(
      join(kizunaDir, "plugins.json"),
      JSON.stringify({
        plugins: {
          "@kizuna/plugin-pii-sanitizer": { enabled: false, options: {} },
        },
      }),
    );
    const transcriptPath = createTranscript(tempDir);

    const result = runHook("session-end", {
      session_id: "disabled-plugin-session",
      transcript_path: transcriptPath,
      cwd: tempDir,
      hook_event_name: "SessionEnd",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stderr).not.toContain("Failed to load plugin");
  });

  it("should load pii-sanitizer plugin and redact content on capture", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    linkPlugin(tempDir, "@kizuna/plugin-pii-sanitizer");
    writeFileSync(
      join(kizunaDir, "plugins.json"),
      JSON.stringify({
        plugins: {
          "@kizuna/plugin-pii-sanitizer": { enabled: true, options: {} },
        },
      }),
    );
    const transcriptPath = createTranscript(tempDir);

    const result = runHook("session-end", {
      session_id: "pii-plugin-session",
      transcript_path: transcriptPath,
      cwd: tempDir,
      hook_event_name: "SessionEnd",
    });

    expect(result.exitCode).toBe(0);

    const db = new Database(join(kizunaDir, "memory.db"));
    try {
      const chunks = db.getChunksBySession("pii-plugin-session");
      const userChunk = chunks.find((c) => c.role === "user");
      expect(userChunk).toBeDefined();
      expect(userChunk!.content).toContain("[REDACTED:");
      expect(userChunk!.content).not.toContain("sk-ant-api03-SECRET-KEY-HERE");
    } finally {
      db.close();
    }
  });

  it("should load plugin for prompt-submit hook", async () => {
    await seedDatabase(tempDir);
    linkPlugin(tempDir, "@kizuna/plugin-pii-sanitizer");
    writeFileSync(
      join(tempDir, ".kizuna", "plugins.json"),
      JSON.stringify({
        plugins: {
          "@kizuna/plugin-pii-sanitizer": { enabled: true, options: {} },
        },
      }),
    );

    const result = runHook("prompt-submit", {
      session_id: "current-session",
      transcript_path: "",
      cwd: tempDir,
      hook_event_name: "UserPromptSubmit",
      prompt: "WAL SQLite",
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Relevant Memories");
  });

  it("should load plugin for stop hook", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    linkPlugin(tempDir, "@kizuna/plugin-pii-sanitizer");
    writeFileSync(
      join(kizunaDir, "plugins.json"),
      JSON.stringify({
        plugins: {
          "@kizuna/plugin-pii-sanitizer": { enabled: true, options: {} },
        },
      }),
    );
    const transcriptPath = createTranscript(tempDir);

    const result = runHook("stop", {
      session_id: "stop-plugin-session",
      transcript_path: transcriptPath,
      cwd: tempDir,
      hook_event_name: "Stop",
    });

    expect(result.exitCode).toBe(0);

    const db = new Database(join(kizunaDir, "memory.db"));
    try {
      const chunks = db.getChunksBySession("stop-plugin-session");
      const userChunk = chunks.find((c) => c.role === "user");
      expect(userChunk).toBeDefined();
      expect(userChunk!.content).toContain("[REDACTED:");
    } finally {
      db.close();
    }
  });

  it("should generate plugins.json template via setup", () => {
    const result = spawnSync(TSX_BIN, [CLI_PATH, "setup", "--cwd", tempDir], {
      encoding: "utf-8",
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });

    expect(result.status).toBe(0);

    const pluginsJsonPath = join(tempDir, ".kizuna", "plugins.json");
    expect(existsSync(pluginsJsonPath)).toBe(true);

    const config = JSON.parse(readFileSync(pluginsJsonPath, "utf-8"));
    expect(config).toEqual({ plugins: {} });
  });

  it("should not overwrite existing plugins.json on re-setup", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    const existingConfig = {
      plugins: {
        "@kizuna/plugin-pii-sanitizer": { enabled: true, options: {} },
      },
    };
    writeFileSync(join(kizunaDir, "plugins.json"), JSON.stringify(existingConfig));

    spawnSync(TSX_BIN, [CLI_PATH, "setup", "--cwd", tempDir], {
      encoding: "utf-8",
      env: { ...process.env, NODE_NO_WARNINGS: "1" },
    });

    const config = JSON.parse(readFileSync(join(kizunaDir, "plugins.json"), "utf-8"));
    expect(config).toEqual(existingConfig);
  });
});
