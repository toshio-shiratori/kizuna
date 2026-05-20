import { describe, it, expect } from "vitest";
import { formatRedactionSummary } from "./session-end.js";

interface PiiSanitizerStats {
  totalRedacted: number;
  byPattern: Record<string, number>;
  lastRedactedAt: string;
  sessionsWithRedactions: number;
}

function makeStats(overrides: Partial<PiiSanitizerStats> = {}): PiiSanitizerStats {
  return {
    totalRedacted: 0,
    byPattern: {},
    lastRedactedAt: "",
    sessionsWithRedactions: 0,
    ...overrides,
  };
}

describe("formatRedactionSummary", () => {
  it("returns null when after is null", () => {
    expect(formatRedactionSummary(null, null)).toBeNull();
  });

  it("returns null when no new redactions occurred", () => {
    const stats = makeStats({ totalRedacted: 5, byPattern: { anthropic_key: 5 } });
    expect(formatRedactionSummary(stats, stats)).toBeNull();
  });

  it("formats a summary when redactions occurred from zero", () => {
    const after = makeStats({
      totalRedacted: 3,
      byPattern: { anthropic_key: 2, github_token: 1 },
    });
    const result = formatRedactionSummary(null, after);
    expect(result).toBe(
      "kizuna: pii-sanitizer redacted 3 items (anthropic_key: 2, github_token: 1)\n",
    );
  });

  it("formats a summary with diff from previous stats", () => {
    const before = makeStats({
      totalRedacted: 5,
      byPattern: { anthropic_key: 3, github_token: 2 },
    });
    const after = makeStats({
      totalRedacted: 8,
      byPattern: { anthropic_key: 5, github_token: 2, generic_secret: 1 },
    });
    const result = formatRedactionSummary(before, after);
    expect(result).toBe(
      "kizuna: pii-sanitizer redacted 3 items (anthropic_key: 2, generic_secret: 1)\n",
    );
  });

  it("handles single pattern type", () => {
    const after = makeStats({
      totalRedacted: 1,
      byPattern: { anthropic_key: 1 },
    });
    const result = formatRedactionSummary(null, after);
    expect(result).toBe("kizuna: pii-sanitizer redacted 1 item (anthropic_key: 1)\n");
  });
});
