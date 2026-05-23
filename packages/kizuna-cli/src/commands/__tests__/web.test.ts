import { describe, it, expect } from "vitest";
import { runCli, createTempDir, removeTempDir } from "../../test-utils.js";

describe("web command", () => {
  it("should show help with --port and --write options", () => {
    const tempDir = createTempDir();
    try {
      const result = runCli("web --help", tempDir);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("--port");
      expect(result.stdout).toContain("--write");
    } finally {
      removeTempDir(tempDir);
    }
  });

  it("should reject invalid port number", () => {
    const tempDir = createTempDir();
    try {
      const result = runCli("web --port abc", tempDir);
      expect(result.exitCode).toBe(1);
      expect(result.stdout).toContain("Invalid port number");
    } finally {
      removeTempDir(tempDir);
    }
  });
});
