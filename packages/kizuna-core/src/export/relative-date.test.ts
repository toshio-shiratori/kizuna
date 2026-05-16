import { describe, it, expect } from "vitest";
import { parseRelativeDate, isRelativeDate, resolveDateInput } from "./relative-date.js";

describe("isRelativeDate", () => {
  it("recognizes valid relative dates", () => {
    expect(isRelativeDate("7d")).toBe(true);
    expect(isRelativeDate("1w")).toBe(true);
    expect(isRelativeDate("1m")).toBe(true);
    expect(isRelativeDate("30d")).toBe(true);
    expect(isRelativeDate("12m")).toBe(true);
  });

  it("rejects invalid inputs", () => {
    expect(isRelativeDate("7")).toBe(false);
    expect(isRelativeDate("d")).toBe(false);
    expect(isRelativeDate("7x")).toBe(false);
    expect(isRelativeDate("")).toBe(false);
    expect(isRelativeDate("2025-01-15")).toBe(false);
    expect(isRelativeDate("abc")).toBe(false);
    expect(isRelativeDate("7dd")).toBe(false);
  });
});

describe("parseRelativeDate", () => {
  const now = new Date("2025-06-15T12:00:00.000Z");

  it("parses days correctly", () => {
    const result = parseRelativeDate("7d", now);
    expect(result).toEqual(new Date("2025-06-08T12:00:00.000Z"));
  });

  it("parses weeks correctly", () => {
    const result = parseRelativeDate("1w", now);
    expect(result).toEqual(new Date("2025-06-08T12:00:00.000Z"));
  });

  it("parses 2 weeks correctly", () => {
    const result = parseRelativeDate("2w", now);
    expect(result).toEqual(new Date("2025-06-01T12:00:00.000Z"));
  });

  it("parses months correctly", () => {
    const result = parseRelativeDate("1m", now);
    expect(result).toEqual(new Date("2025-05-15T12:00:00.000Z"));
  });

  it("parses multiple months", () => {
    const result = parseRelativeDate("3m", now);
    expect(result).toEqual(new Date("2025-03-15T12:00:00.000Z"));
  });

  it("parses 30 days", () => {
    const result = parseRelativeDate("30d", now);
    expect(result).toEqual(new Date("2025-05-16T12:00:00.000Z"));
  });

  it("throws on invalid format", () => {
    expect(() => parseRelativeDate("abc", now)).toThrow("Invalid relative date format");
    expect(() => parseRelativeDate("7x", now)).toThrow("Invalid relative date format");
    expect(() => parseRelativeDate("", now)).toThrow("Invalid relative date format");
  });
});

describe("resolveDateInput", () => {
  const now = new Date("2025-06-15T12:00:00.000Z");

  it("resolves relative dates to ISO strings", () => {
    const result = resolveDateInput("7d", now);
    expect(result).toBe("2025-06-08T12:00:00.000Z");
  });

  it("resolves ISO 8601 date strings", () => {
    const result = resolveDateInput("2025-01-15", now);
    expect(result).toContain("2025-01-15");
  });

  it("resolves ISO 8601 datetime strings", () => {
    const result = resolveDateInput("2025-01-15T10:00:00Z", now);
    expect(result).toBe("2025-01-15T10:00:00.000Z");
  });

  it("throws on invalid date strings", () => {
    expect(() => resolveDateInput("not-a-date", now)).toThrow("Invalid date");
  });
});
