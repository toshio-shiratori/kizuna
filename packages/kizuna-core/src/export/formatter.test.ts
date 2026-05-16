import { describe, it, expect } from "vitest";
import { formatMarkdown, formatJson, formatExport } from "./formatter.js";
import type { ExportData } from "./formatter.js";

function createTestData(): ExportData {
  return {
    meta: {
      projectId: "my-project",
      exportedAt: "2025-06-15T12:00:00.000Z",
      chunkCount: 2,
      dateRange: {
        from: "2025-06-14T10:00:00.000Z",
        to: "2025-06-15T10:00:00.000Z",
      },
      filters: {
        since: "7d",
        limit: 100,
      },
    },
    chunks: [
      {
        id: 2,
        sessionId: "session-abc-12345678",
        turnIndex: 1,
        role: "assistant",
        content: "This is the assistant response.",
        tokenCount: 10,
        importance: 7,
        createdAt: "2025-06-15T10:00:00.000Z",
        metadata: { tool: "search" },
      },
      {
        id: 1,
        sessionId: "session-abc-12345678",
        turnIndex: 0,
        role: "user",
        content: "Hello, how are you?",
        tokenCount: 5,
        importance: 3,
        createdAt: "2025-06-14T10:00:00.000Z",
        metadata: {},
      },
    ],
  };
}

describe("formatMarkdown", () => {
  it("produces ADR-0015 compliant output", () => {
    const data = createTestData();
    const output = formatMarkdown(data);

    // Header
    expect(output).toContain("# Kizuna Memory Export");
    expect(output).toContain("- **Project**: my-project");
    expect(output).toContain("- **Exported**: 2025-06-15T12:00:00.000Z");
    expect(output).toContain("- **Chunks**: 2");
    expect(output).toContain(
      "- **Date range**: 2025-06-14T10:00:00.000Z — 2025-06-15T10:00:00.000Z",
    );
    expect(output).toContain("- **Filters**: since=7d, limit=100");

    // Separator
    expect(output).toContain("---");

    // Chunk headers
    expect(output).toContain(
      "## [2025-06-15T10:00:00.000Z] assistant (session: session-, importance: 7)",
    );
    expect(output).toContain(
      "## [2025-06-14T10:00:00.000Z] user (session: session-, importance: 3)",
    );

    // Content
    expect(output).toContain("This is the assistant response.");
    expect(output).toContain("Hello, how are you?");
  });

  it("handles empty chunks", () => {
    const data: ExportData = {
      meta: {
        projectId: "test",
        exportedAt: "2025-06-15T12:00:00.000Z",
        chunkCount: 0,
        dateRange: null,
        filters: { limit: 100 },
      },
      chunks: [],
    };

    const output = formatMarkdown(data);
    expect(output).toContain("# Kizuna Memory Export");
    expect(output).toContain("- **Chunks**: 0");
    expect(output).toContain("- **Date range**: (none)");
  });

  it("handles filters with query", () => {
    const data = createTestData();
    data.meta.filters = { query: "SQLite", since: "7d", until: "1d", limit: 50 };

    const output = formatMarkdown(data);
    expect(output).toContain('since=7d, until=1d, query="SQLite", limit=50');
  });

  it("shows (none) when no filters applied", () => {
    const data = createTestData();
    data.meta.filters = {};

    const output = formatMarkdown(data);
    expect(output).toContain("- **Filters**: (none)");
  });
});

describe("formatJson", () => {
  it("produces ADR-0015 compliant JSON output", () => {
    const data = createTestData();
    const output = formatJson(data);
    const parsed = JSON.parse(output);

    // Meta
    expect(parsed.meta.projectId).toBe("my-project");
    expect(parsed.meta.exportedAt).toBe("2025-06-15T12:00:00.000Z");
    expect(parsed.meta.chunkCount).toBe(2);
    expect(parsed.meta.dateRange).toEqual({
      from: "2025-06-14T10:00:00.000Z",
      to: "2025-06-15T10:00:00.000Z",
    });
    expect(parsed.meta.filters).toEqual({ since: "7d", limit: 100 });

    // Chunks
    expect(parsed.chunks).toHaveLength(2);
    expect(parsed.chunks[0]).toEqual({
      id: 2,
      sessionId: "session-abc-12345678",
      role: "assistant",
      content: "This is the assistant response.",
      importance: 7,
      createdAt: "2025-06-15T10:00:00.000Z",
      metadata: { tool: "search" },
    });
    expect(parsed.chunks[1]).toEqual({
      id: 1,
      sessionId: "session-abc-12345678",
      role: "user",
      content: "Hello, how are you?",
      importance: 3,
      createdAt: "2025-06-14T10:00:00.000Z",
      metadata: {},
    });
  });

  it("handles empty chunks", () => {
    const data: ExportData = {
      meta: {
        projectId: "test",
        exportedAt: "2025-06-15T12:00:00.000Z",
        chunkCount: 0,
        dateRange: null,
        filters: { limit: 100 },
      },
      chunks: [],
    };

    const output = formatJson(data);
    const parsed = JSON.parse(output);
    expect(parsed.meta.chunkCount).toBe(0);
    expect(parsed.meta.dateRange).toBeNull();
    expect(parsed.chunks).toEqual([]);
  });
});

describe("formatExport", () => {
  it("dispatches to markdown formatter", () => {
    const data = createTestData();
    const output = formatExport(data, "markdown");
    expect(output).toContain("# Kizuna Memory Export");
  });

  it("dispatches to json formatter", () => {
    const data = createTestData();
    const output = formatExport(data, "json");
    const parsed = JSON.parse(output);
    expect(parsed.meta).toBeDefined();
    expect(parsed.chunks).toBeDefined();
  });
});
