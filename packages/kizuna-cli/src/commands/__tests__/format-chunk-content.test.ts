import { describe, it, expect } from "vitest";
import { formatChunkContent } from "../recap.js";

describe("formatChunkContent", () => {
  describe("verbose mode (maxContentLength === null)", () => {
    it("should return full content for assistant role", () => {
      const content = "A".repeat(1000);
      expect(formatChunkContent(content, "assistant", null)).toBe(content);
    });

    it("should return full content for user role", () => {
      const content = "U".repeat(1000);
      expect(formatChunkContent(content, "user", null)).toBe(content);
    });
  });

  describe("user role", () => {
    it("should not truncate user content regardless of length", () => {
      const content = "U".repeat(1000);
      expect(formatChunkContent(content, "user", 500)).toBe(content);
    });

    it("should return short user content unchanged", () => {
      expect(formatChunkContent("hello", "user", 500)).toBe("hello");
    });
  });

  describe("assistant role", () => {
    it("should not truncate content within limit", () => {
      const content = "A".repeat(500);
      expect(formatChunkContent(content, "assistant", 500)).toBe(content);
    });

    it("should not truncate content shorter than limit", () => {
      expect(formatChunkContent("short", "assistant", 500)).toBe("short");
    });

    it("should truncate content exceeding limit", () => {
      const content = "A".repeat(800);
      const result = formatChunkContent(content, "assistant", 500);
      expect(result).toBe("A".repeat(500) + "... (truncated, 800 chars total)");
    });

    it("should show correct total character count", () => {
      const content = "X".repeat(1234);
      const result = formatChunkContent(content, "assistant", 100);
      expect(result).toContain("1234 chars total");
    });

    it("should truncate content exceeding limit by exactly 1 char", () => {
      const content = "B".repeat(501);
      const result = formatChunkContent(content, "assistant", 500);
      expect(result).toBe("B".repeat(500) + "... (truncated, 501 chars total)");
    });
  });
});
