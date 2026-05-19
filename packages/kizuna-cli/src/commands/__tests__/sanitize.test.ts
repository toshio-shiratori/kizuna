import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Database, estimateTokens } from "@kizuna/core";
import { runCli, createTempDir, removeTempDir } from "../../test-utils.js";
import { resolvePluginDistPath, PLUGIN_REGISTRY } from "../plugin/registry.js";

function distKey(shortName: string): string {
  const def = PLUGIN_REGISTRY.find((p) => p.shortName === shortName)!;
  return resolvePluginDistPath(def);
}

function seedWithPii(cwd: string): Database {
  const kizunaDir = join(cwd, ".kizuna");
  mkdirSync(kizunaDir, { recursive: true });

  writeFileSync(
    join(kizunaDir, "plugins.json"),
    JSON.stringify({
      plugins: { [distKey("pii-sanitizer")]: { enabled: true } },
    }),
  );

  const db = new Database(join(kizunaDir, "memory.db"));
  db.insertSession({
    id: "session-1",
    projectId: "test-project",
    startedAt: "2025-01-15T10:00:00Z",
    endedAt: "2025-01-15T11:00:00Z",
    transcriptPath: null,
    metadata: {},
  });

  db.insertChunk({
    sessionId: "session-1",
    turnIndex: 0,
    role: "user",
    content: "Use this API key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz",
    metadata: {},
  });

  db.insertChunk({
    sessionId: "session-1",
    turnIndex: 1,
    role: "assistant",
    content: "I will use the GitHub token ghp_abcdefghijklmnopqrstuvwxyz0123456789",
    metadata: {},
  });

  db.insertChunk({
    sessionId: "session-1",
    turnIndex: 2,
    role: "user",
    content: "This is a normal message without any secrets",
    metadata: {},
  });

  return db;
}

describe("sanitize command", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  it("should error when no database exists", () => {
    const result = runCli(`sanitize --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("No Kizuna database found");
  });

  it("should error when pii-sanitizer is not enabled (no plugins.json)", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    // Create the database but no plugins.json
    const db = new Database(join(kizunaDir, "memory.db"));
    db.close();

    const result = runCli(`sanitize --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("pii-sanitizer is not enabled");
  });

  it("should error when pii-sanitizer is disabled in plugins.json", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });
    const db = new Database(join(kizunaDir, "memory.db"));
    db.close();

    writeFileSync(
      join(kizunaDir, "plugins.json"),
      JSON.stringify({
        plugins: { [distKey("pii-sanitizer")]: { enabled: false } },
      }),
    );

    const result = runCli(`sanitize --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("pii-sanitizer is not enabled");
  });

  it("should show matches without modifying data in --dry-run mode", () => {
    const db = seedWithPii(tempDir);
    db.close();

    const result = runCli(`sanitize --dry-run --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Found 2 chunks with 2 PII matches:");
    expect(result.stdout).toContain("anthropic_key: 1");
    expect(result.stdout).toContain("github_token: 1");
    expect(result.stdout).toContain("Run without --dry-run to apply sanitization.");

    // Verify chunks are NOT modified
    const dbAfter = new Database(join(tempDir, ".kizuna", "memory.db"), { readonly: true });
    try {
      const chunks = dbAfter.getChunksBySession("session-1");
      expect(chunks).toHaveLength(3);
      expect(chunks[0]!.content).toContain("sk-ant-api03-abcdefghijklmnopqrstuvwxyz");
      expect(chunks[1]!.content).toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
    } finally {
      dbAfter.close();
    }
  });

  it("should sanitize chunks with --yes and update content, metadata, and token_count", () => {
    const db = seedWithPii(tempDir);

    // Record original token counts
    const originalChunks = db.getChunksBySession("session-1");
    const originalTokenCount0 = (
      db.db.prepare("SELECT token_count FROM chunks WHERE id = ?").get(originalChunks[0]!.id) as {
        token_count: number;
      }
    ).token_count;
    const originalTokenCount1 = (
      db.db.prepare("SELECT token_count FROM chunks WHERE id = ?").get(originalChunks[1]!.id) as {
        token_count: number;
      }
    ).token_count;
    db.close();

    const result = runCli(`sanitize --yes --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Sanitization completed:");
    expect(result.stdout).toContain("Chunks updated:    2");
    expect(result.stdout).toContain("Total redactions:  2");

    // Verify chunks are updated
    const dbAfter = new Database(join(tempDir, ".kizuna", "memory.db"), { readonly: true });
    try {
      const chunks = dbAfter.getChunksBySession("session-1");
      expect(chunks).toHaveLength(3);

      const chunk0 = chunks[0]!;
      const chunk1 = chunks[1]!;
      const chunk2 = chunks[2]!;

      // Chunk 0: anthropic key redacted
      expect(chunk0.content).toContain("[REDACTED:anthropic_key]");
      expect(chunk0.content).not.toContain("sk-ant-api03-abcdefghijklmnopqrstuvwxyz");
      const meta0 = chunk0.metadata as Record<string, unknown>;
      const piiMeta0 = meta0["@kizuna/plugin-pii-sanitizer"] as {
        redactedCount: number;
        redactedTypes: string[];
      };
      expect(piiMeta0.redactedCount).toBe(1);
      expect(piiMeta0.redactedTypes).toContain("anthropic_key");

      // Chunk 1: github token redacted
      expect(chunk1.content).toContain("[REDACTED:github_token]");
      expect(chunk1.content).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
      const meta1 = chunk1.metadata as Record<string, unknown>;
      const piiMeta1 = meta1["@kizuna/plugin-pii-sanitizer"] as {
        redactedCount: number;
        redactedTypes: string[];
      };
      expect(piiMeta1.redactedCount).toBe(1);
      expect(piiMeta1.redactedTypes).toContain("github_token");

      // Chunk 2: unchanged (no PII)
      expect(chunk2.content).toBe("This is a normal message without any secrets");

      // Verify token_count was recalculated
      const newTokenCount0 = (
        dbAfter.db.prepare("SELECT token_count FROM chunks WHERE id = ?").get(chunk0.id) as {
          token_count: number;
        }
      ).token_count;
      const newTokenCount1 = (
        dbAfter.db.prepare("SELECT token_count FROM chunks WHERE id = ?").get(chunk1.id) as {
          token_count: number;
        }
      ).token_count;

      // The redacted content has different length, so token counts should be recalculated
      expect(newTokenCount0).toBe(estimateTokens(chunk0.content));
      expect(newTokenCount1).toBe(estimateTokens(chunk1.content));

      // Token counts should differ from originals (content length changed)
      expect(newTokenCount0).not.toBe(originalTokenCount0);
      expect(newTokenCount1).not.toBe(originalTokenCount1);
    } finally {
      dbAfter.close();
    }
  });

  it("should update FTS index after sanitization", () => {
    const db = seedWithPii(tempDir);
    db.close();

    const result = runCli(`sanitize --yes --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);

    const dbAfter = new Database(join(tempDir, ".kizuna", "memory.db"), { readonly: true });
    try {
      // Searching for the original key via LIKE should return no results
      // (FTS5 interprets hyphens as operators, so use LIKE for exact substring matching)
      const searchResults = dbAfter.searchChunksLikeOnly(["%sk-ant-api03%"], 10);
      expect(searchResults).toHaveLength(0);

      // FTS search for "abcdefghijklmnopqrstuvwxyz" (the key body) should also return nothing
      const ftsResults = dbAfter.searchChunks("abcdefghijklmnopqrstuvwxyz", 10);
      expect(ftsResults).toHaveLength(0);

      // Searching for content that still exists should work
      const normalResults = dbAfter.searchChunks("normal message", 10);
      expect(normalResults.length).toBeGreaterThan(0);
    } finally {
      dbAfter.close();
    }
  });

  it("should filter to specific session with --session", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });

    writeFileSync(
      join(kizunaDir, "plugins.json"),
      JSON.stringify({
        plugins: { [distKey("pii-sanitizer")]: { enabled: true } },
      }),
    );

    const db = new Database(join(kizunaDir, "memory.db"));

    // Session 1
    db.insertSession({
      id: "session-1",
      projectId: "test-project",
      startedAt: "2025-01-15T10:00:00Z",
      endedAt: "2025-01-15T11:00:00Z",
      transcriptPath: null,
      metadata: {},
    });
    db.insertChunk({
      sessionId: "session-1",
      turnIndex: 0,
      role: "user",
      content: "Use this key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz",
      metadata: {},
    });

    // Session 2
    db.insertSession({
      id: "session-2",
      projectId: "test-project",
      startedAt: "2025-01-16T10:00:00Z",
      endedAt: "2025-01-16T11:00:00Z",
      transcriptPath: null,
      metadata: {},
    });
    db.insertChunk({
      sessionId: "session-2",
      turnIndex: 0,
      role: "user",
      content: "Another key: ghp_abcdefghijklmnopqrstuvwxyz0123456789",
      metadata: {},
    });

    db.close();

    // Only sanitize session-1
    const result = runCli(`sanitize --yes --session session-1 --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Chunks updated:    1");

    const dbAfter = new Database(join(kizunaDir, "memory.db"), { readonly: true });
    try {
      // Session 1 should be sanitized
      const session1Chunks = dbAfter.getChunksBySession("session-1");
      expect(session1Chunks).toHaveLength(1);
      expect(session1Chunks[0]!.content).toContain("[REDACTED:anthropic_key]");
      expect(session1Chunks[0]!.content).not.toContain("sk-ant-api03-abcdefghijklmnopqrstuvwxyz");

      // Session 2 should NOT be sanitized
      const session2Chunks = dbAfter.getChunksBySession("session-2");
      expect(session2Chunks).toHaveLength(1);
      expect(session2Chunks[0]!.content).toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");
      expect(session2Chunks[0]!.content).not.toContain("[REDACTED:");
    } finally {
      dbAfter.close();
    }
  });

  it("should report clean data when no chunks need sanitization", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });

    writeFileSync(
      join(kizunaDir, "plugins.json"),
      JSON.stringify({
        plugins: { [distKey("pii-sanitizer")]: { enabled: true } },
      }),
    );

    const db = new Database(join(kizunaDir, "memory.db"));
    db.insertSession({
      id: "session-1",
      projectId: "test-project",
      startedAt: "2025-01-15T10:00:00Z",
      endedAt: "2025-01-15T11:00:00Z",
      transcriptPath: null,
      metadata: {},
    });
    db.insertChunk({
      sessionId: "session-1",
      turnIndex: 0,
      role: "user",
      content: "This is a normal message without any secrets",
      metadata: {},
    });
    db.close();

    const result = runCli(`sanitize --yes --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No chunks require sanitization. All data is clean.");
  });

  it("should error in non-interactive mode without --yes", () => {
    const db = seedWithPii(tempDir);
    db.close();

    const result = runCli(`sanitize --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("Use --yes to confirm sanitization in non-interactive mode.");
  });

  it("should apply custom patterns from config", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });

    writeFileSync(
      join(kizunaDir, "plugins.json"),
      JSON.stringify({
        plugins: {
          [distKey("pii-sanitizer")]: {
            enabled: true,
            options: {
              customPatterns: [
                {
                  name: "mariadb_password",
                  pattern: "MARIADB_ROOT_PASSWORD\\s*=\\s*\\S+",
                  flags: "g",
                },
              ],
            },
          },
        },
      }),
    );

    const db = new Database(join(kizunaDir, "memory.db"));
    db.insertSession({
      id: "session-1",
      projectId: "test-project",
      startedAt: "2025-01-15T10:00:00Z",
      endedAt: "2025-01-15T11:00:00Z",
      transcriptPath: null,
      metadata: {},
    });

    // Chunk with custom pattern match
    db.insertChunk({
      sessionId: "session-1",
      turnIndex: 0,
      role: "user",
      content: "Set MARIADB_ROOT_PASSWORD = secret123 in docker-compose",
      metadata: {},
    });

    // Chunk with default pattern match
    db.insertChunk({
      sessionId: "session-1",
      turnIndex: 1,
      role: "user",
      content: "Use this API key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz",
      metadata: {},
    });

    db.close();

    const result = runCli(`sanitize --yes --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Sanitization completed:");
    expect(result.stdout).toContain("Chunks updated:    2");

    const dbAfter = new Database(join(kizunaDir, "memory.db"), { readonly: true });
    try {
      const chunks = dbAfter.getChunksBySession("session-1");
      expect(chunks).toHaveLength(2);

      const chunk0 = chunks[0]!;
      const chunk1 = chunks[1]!;

      // Custom pattern redacted
      expect(chunk0.content).toContain("[REDACTED:mariadb_password]");
      expect(chunk0.content).not.toContain("secret123");
      const meta0 = chunk0.metadata as Record<string, unknown>;
      const piiMeta0 = meta0["@kizuna/plugin-pii-sanitizer"] as {
        redactedCount: number;
        redactedTypes: string[];
      };
      expect(piiMeta0.redactedTypes).toContain("mariadb_password");

      // Default pattern also redacted
      expect(chunk1.content).toContain("[REDACTED:anthropic_key]");
      expect(chunk1.content).not.toContain("sk-ant-api03-abcdefghijklmnopqrstuvwxyz");
    } finally {
      dbAfter.close();
    }
  });

  it("should preserve existing metadata on chunks during sanitization", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });

    writeFileSync(
      join(kizunaDir, "plugins.json"),
      JSON.stringify({
        plugins: { [distKey("pii-sanitizer")]: { enabled: true } },
      }),
    );

    const db = new Database(join(kizunaDir, "memory.db"));
    db.insertSession({
      id: "session-1",
      projectId: "test-project",
      startedAt: "2025-01-15T10:00:00Z",
      endedAt: "2025-01-15T11:00:00Z",
      transcriptPath: null,
      metadata: {},
    });

    db.insertChunk({
      sessionId: "session-1",
      turnIndex: 0,
      role: "user",
      content: "Use this key: sk-ant-api03-abcdefghijklmnopqrstuvwxyz",
      metadata: { custom: "preserved", source: "test" },
    });

    db.close();

    const result = runCli(`sanitize --yes --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);

    const dbAfter = new Database(join(kizunaDir, "memory.db"), { readonly: true });
    try {
      const chunks = dbAfter.getChunksBySession("session-1");
      expect(chunks).toHaveLength(1);

      const meta = chunks[0]!.metadata as Record<string, unknown>;
      // Existing metadata fields should be preserved
      expect(meta["custom"]).toBe("preserved");
      expect(meta["source"]).toBe("test");
      // PII sanitizer metadata should be added
      const piiMeta = meta["@kizuna/plugin-pii-sanitizer"] as {
        redactedCount: number;
        redactedTypes: string[];
      };
      expect(piiMeta.redactedCount).toBe(1);
      expect(piiMeta.redactedTypes).toContain("anthropic_key");
    } finally {
      dbAfter.close();
    }
  });

  it("should handle multiple PII patterns in a single chunk", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });

    writeFileSync(
      join(kizunaDir, "plugins.json"),
      JSON.stringify({
        plugins: { [distKey("pii-sanitizer")]: { enabled: true } },
      }),
    );

    const db = new Database(join(kizunaDir, "memory.db"));
    db.insertSession({
      id: "session-1",
      projectId: "test-project",
      startedAt: "2025-01-15T10:00:00Z",
      endedAt: "2025-01-15T11:00:00Z",
      transcriptPath: null,
      metadata: {},
    });

    // Single chunk containing both an Anthropic key and a GitHub token
    db.insertChunk({
      sessionId: "session-1",
      turnIndex: 0,
      role: "user",
      content:
        "Anthropic: sk-ant-api03-abcdefghijklmnopqrstuvwxyz and GitHub: ghp_abcdefghijklmnopqrstuvwxyz0123456789",
      metadata: {},
    });

    db.close();

    const result = runCli(`sanitize --yes --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("Chunks updated:    1");
    expect(result.stdout).toContain("Total redactions:  2");

    const dbAfter = new Database(join(kizunaDir, "memory.db"), { readonly: true });
    try {
      const chunks = dbAfter.getChunksBySession("session-1");
      expect(chunks).toHaveLength(1);

      const chunk = chunks[0]!;
      expect(chunk.content).toContain("[REDACTED:anthropic_key]");
      expect(chunk.content).toContain("[REDACTED:github_token]");
      expect(chunk.content).not.toContain("sk-ant-api03-abcdefghijklmnopqrstuvwxyz");
      expect(chunk.content).not.toContain("ghp_abcdefghijklmnopqrstuvwxyz0123456789");

      const meta = chunk.metadata as Record<string, unknown>;
      const piiMeta = meta["@kizuna/plugin-pii-sanitizer"] as {
        redactedCount: number;
        redactedTypes: string[];
      };
      expect(piiMeta.redactedCount).toBe(2);
      expect(piiMeta.redactedTypes).toContain("anthropic_key");
      expect(piiMeta.redactedTypes).toContain("github_token");
    } finally {
      dbAfter.close();
    }
  });

  it("should handle Japanese content without corruption during sanitization", () => {
    const kizunaDir = join(tempDir, ".kizuna");
    mkdirSync(kizunaDir, { recursive: true });

    writeFileSync(
      join(kizunaDir, "plugins.json"),
      JSON.stringify({
        plugins: { [distKey("pii-sanitizer")]: { enabled: true } },
      }),
    );

    const db = new Database(join(kizunaDir, "memory.db"));
    db.insertSession({
      id: "session-1",
      projectId: "test-project",
      startedAt: "2025-01-15T10:00:00Z",
      endedAt: "2025-01-15T11:00:00Z",
      transcriptPath: null,
      metadata: {},
    });

    db.insertChunk({
      sessionId: "session-1",
      turnIndex: 0,
      role: "user",
      content:
        "APIキーを設定してください: sk-ant-api03-abcdefghijklmnopqrstuvwxyz。これで認証が完了します。",
      metadata: {},
    });

    db.close();

    const result = runCli(`sanitize --yes --cwd ${tempDir}`, tempDir);
    expect(result.exitCode).toBe(0);

    const dbAfter = new Database(join(kizunaDir, "memory.db"), { readonly: true });
    try {
      const chunks = dbAfter.getChunksBySession("session-1");
      expect(chunks).toHaveLength(1);

      const chunk = chunks[0]!;
      // Japanese text preserved, key redacted
      expect(chunk.content).toContain("APIキーを設定してください:");
      expect(chunk.content).toContain("[REDACTED:anthropic_key]");
      expect(chunk.content).toContain("これで認証が完了します。");
      expect(chunk.content).not.toContain("sk-ant-api03-abcdefghijklmnopqrstuvwxyz");
    } finally {
      dbAfter.close();
    }
  });
});
