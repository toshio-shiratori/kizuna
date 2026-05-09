import { describe, it, expect } from "vitest";
import type { RawChunk, PluginContext, PluginConfig, Logger } from "@kizuna/core";
import { piiSanitizer, redactContent, DEFAULT_PATTERNS, compilePatterns } from "./index.js";

function runBeforeCapture(chunk: RawChunk, ctx: PluginContext): RawChunk | null {
  return piiSanitizer.beforeCapture!(chunk, ctx) as RawChunk | null;
}

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
  const messages: Array<{ level: string; message: string; meta?: Record<string, unknown> }> = [];
  const logger: Logger = {
    debug(msg, meta) {
      messages.push({ level: "debug", message: msg, meta });
    },
    info(msg, meta) {
      messages.push({ level: "info", message: msg, meta });
    },
    warn(msg, meta) {
      messages.push({ level: "warn", message: msg, meta });
    },
    error(msg, meta) {
      messages.push({ level: "error", message: msg, meta });
    },
  };
  const config: PluginConfig = { enabled: true, options };
  return {
    db: {},
    config,
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

describe("redactContent", () => {
  it("redacts Anthropic API keys", () => {
    const input = "My key is sk-ant-abc123def456ghi789jkl012mno345";
    const result = redactContent(input, DEFAULT_PATTERNS);
    expect(result.content).toBe("My key is [REDACTED:anthropic_key]");
    expect(result.redactedCount).toBe(1);
    expect(result.redactedTypes).toContain("anthropic_key");
  });

  it("redacts OpenAI API keys", () => {
    const input = "export OPENAI_API_KEY=sk-abcdefghijklmnopqrstuvwxyz0123456789";
    const result = redactContent(input, DEFAULT_PATTERNS);
    expect(result.content).toContain("[REDACTED:openai_key]");
    expect(result.redactedTypes).toContain("openai_key");
  });

  it("redacts GitHub personal access tokens", () => {
    const input = "token: ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";
    const result = redactContent(input, DEFAULT_PATTERNS);
    expect(result.content).toContain("[REDACTED:github_token]");
    expect(result.redactedTypes).toContain("github_token");
  });

  it("redacts GitHub OAuth tokens", () => {
    const input = "oauth: gho_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij";
    const result = redactContent(input, DEFAULT_PATTERNS);
    expect(result.content).toContain("[REDACTED:github_oauth]");
    expect(result.redactedTypes).toContain("github_oauth");
  });

  it("redacts GitHub fine-grained PATs", () => {
    const input = "pat: github_pat_ABCDEFGHIJKLMNOPQRSTUV_extra";
    const result = redactContent(input, DEFAULT_PATTERNS);
    expect(result.content).toContain("[REDACTED:github_pat]");
    expect(result.redactedTypes).toContain("github_pat");
  });

  it("redacts AWS access key IDs", () => {
    const input = "aws_access_key_id = AKIAIOSFODNN7EXAMPLE";
    const result = redactContent(input, DEFAULT_PATTERNS);
    expect(result.content).toContain("[REDACTED:aws_access_key]");
    expect(result.redactedTypes).toContain("aws_access_key");
  });

  it("redacts AWS secret access keys", () => {
    const input = 'AWS_SECRET_ACCESS_KEY="wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"';
    const result = redactContent(input, DEFAULT_PATTERNS);
    expect(result.content).toContain("[REDACTED:aws_secret_key]");
    expect(result.redactedTypes).toContain("aws_secret_key");
  });

  it("redacts Slack tokens", () => {
    const input = "SLACK_TOKEN=xoxb-123456789012-1234567890123-abcdefghijklmnopqrstuvwx";
    const result = redactContent(input, DEFAULT_PATTERNS);
    expect(result.content).toContain("[REDACTED:slack_token]");
    expect(result.redactedTypes).toContain("slack_token");
  });

  it("redacts generic secrets in key=value format", () => {
    const input = 'api_key="my-super-secret-value-here-1234"';
    const result = redactContent(input, DEFAULT_PATTERNS);
    expect(result.content).toContain("[REDACTED:generic_secret]");
    expect(result.redactedTypes).toContain("generic_secret");
  });

  it("redacts generic secrets with 'token' keyword", () => {
    const input = "token='abcdefghijklmnopqrstuvwxyz1234'";
    const result = redactContent(input, DEFAULT_PATTERNS);
    expect(result.content).toContain("[REDACTED:generic_secret]");
  });

  it("redacts generic secrets with 'password' keyword", () => {
    const input = "password: 'my-database-password-1234'";
    const result = redactContent(input, DEFAULT_PATTERNS);
    expect(result.content).toContain("[REDACTED:generic_secret]");
  });

  it("redacts multiple secrets in one string", () => {
    const input = [
      "export ANTHROPIC_KEY=sk-ant-abc123def456ghi789jkl012mno345",
      "export GITHUB_TOKEN=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij",
    ].join("\n");
    const result = redactContent(input, DEFAULT_PATTERNS);
    expect(result.redactedCount).toBe(2);
    expect(result.redactedTypes).toContain("anthropic_key");
    expect(result.redactedTypes).toContain("github_token");
  });

  it("returns original content when no secrets found", () => {
    const input = "This is a normal conversation about code.";
    const result = redactContent(input, DEFAULT_PATTERNS);
    expect(result.content).toBe(input);
    expect(result.redactedCount).toBe(0);
    expect(result.redactedTypes).toEqual([]);
  });

  it("does not redact short strings that look like prefixes", () => {
    const input = "The sk-ant prefix is used by Anthropic.";
    const result = redactContent(input, DEFAULT_PATTERNS);
    expect(result.content).toBe(input);
    expect(result.redactedCount).toBe(0);
  });
});

describe("compilePatterns", () => {
  it("returns default patterns when no custom patterns given", () => {
    const patterns = compilePatterns();
    expect(patterns.length).toBe(DEFAULT_PATTERNS.length);
  });

  it("appends custom patterns", () => {
    const custom = [{ name: "my_token", pattern: "myprefix_[A-Za-z0-9]{10,}", flags: "g" }];
    const patterns = compilePatterns(custom);
    expect(patterns.length).toBe(DEFAULT_PATTERNS.length + 1);
    expect(patterns[patterns.length - 1]!.name).toBe("my_token");
  });

  it("custom patterns work for redaction", () => {
    const custom = [{ name: "my_token", pattern: "myprefix_[A-Za-z0-9]{10,}", flags: "g" }];
    const patterns = compilePatterns(custom);
    const result = redactContent("key: myprefix_abcdefghij1234", patterns);
    expect(result.content).toContain("[REDACTED:my_token]");
    expect(result.redactedTypes).toContain("my_token");
  });
});

describe("piiSanitizer plugin", () => {
  it("has correct metadata", () => {
    expect(piiSanitizer.name).toBe("@kizuna/plugin-pii-sanitizer");
    expect(piiSanitizer.version).toBe("0.0.0");
    expect(piiSanitizer.description).toBeDefined();
  });

  it("redacts secrets in beforeCapture", () => {
    const chunk = makeChunk("My key: sk-ant-abc123def456ghi789jkl012mno345");
    const ctx = makeContext();
    const result = runBeforeCapture(chunk, ctx);
    expect(result).not.toBeNull();
    expect(result!.content).toBe("My key: [REDACTED:anthropic_key]");
    expect(result!.metadata["@kizuna/plugin-pii-sanitizer"]).toEqual({
      redactedCount: 1,
      redactedTypes: ["anthropic_key"],
    });
  });

  it("returns original chunk when no secrets found", () => {
    const chunk = makeChunk("Just talking about code");
    const ctx = makeContext();
    const result = runBeforeCapture(chunk, ctx);
    expect(result).toEqual(chunk);
  });

  it("preserves existing metadata", () => {
    const chunk = makeChunk("key: sk-ant-abc123def456ghi789jkl012mno345");
    chunk.metadata = { existingKey: "existingValue" };
    const ctx = makeContext();
    const result = runBeforeCapture(chunk, ctx);
    expect(result!.metadata["existingKey"]).toBe("existingValue");
    expect(result!.metadata["@kizuna/plugin-pii-sanitizer"]).toBeDefined();
  });

  it("logs redaction info", () => {
    const chunk = makeChunk("key: sk-ant-abc123def456ghi789jkl012mno345");
    const logMessages: Array<{ message: string; meta?: Record<string, unknown> }> = [];
    const ctx = makeContext();
    ctx.logger.info = (msg: string, meta?: Record<string, unknown>) => {
      logMessages.push({ message: msg, meta });
    };
    runBeforeCapture(chunk, ctx);
    expect(logMessages).toHaveLength(1);
    expect(logMessages[0]!.message).toBe("Redacted PII");
    expect(logMessages[0]!.meta).toEqual({ redactedCount: 1, redactedTypes: ["anthropic_key"] });
  });

  it("supports custom patterns via options", () => {
    const chunk = makeChunk("my_token: custom_prefix_abcdefghij1234");
    const ctx = makeContext({
      customPatterns: [
        { name: "custom_token", pattern: "custom_prefix_[A-Za-z0-9]{10,}", flags: "g" },
      ],
    });
    const result = runBeforeCapture(chunk, ctx);
    expect(result!.content).toContain("[REDACTED:custom_token]");
  });

  it("does not mutate the original chunk", () => {
    const chunk = makeChunk("key: sk-ant-abc123def456ghi789jkl012mno345");
    const originalContent = chunk.content;
    const ctx = makeContext();
    runBeforeCapture(chunk, ctx);
    expect(chunk.content).toBe(originalContent);
  });
});
