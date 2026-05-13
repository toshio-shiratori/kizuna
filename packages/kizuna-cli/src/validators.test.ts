import { describe, it, expect } from "vitest";
import { InvalidArgumentError } from "commander";
import { createPositiveIntParser, createNonNegativeIntParser } from "./validators.js";

describe("createPositiveIntParser", () => {
  const parse = createPositiveIntParser("--limit", 1000);

  it("should parse a valid positive integer", () => {
    expect(parse("10")).toBe(10);
    expect(parse("1")).toBe(1);
    expect(parse("1000")).toBe(1000);
  });

  it("should reject zero", () => {
    expect(() => parse("0")).toThrow(InvalidArgumentError);
    expect(() => parse("0")).toThrow("--limit must be a positive integer.");
  });

  it("should reject negative numbers", () => {
    expect(() => parse("-1")).toThrow(InvalidArgumentError);
    expect(() => parse("-1")).toThrow("--limit must be a positive integer.");
  });

  it("should reject non-numeric strings", () => {
    expect(() => parse("abc")).toThrow(InvalidArgumentError);
    expect(() => parse("abc")).toThrow("--limit must be a positive integer.");
  });

  it("should reject values exceeding the maximum", () => {
    expect(() => parse("1001")).toThrow(InvalidArgumentError);
    expect(() => parse("1001")).toThrow("--limit must be at most 1000 (got 1001).");
  });

  it("should truncate float values to integer", () => {
    expect(parse("3.5")).toBe(3);
  });

  it("should reject empty string", () => {
    expect(() => parse("")).toThrow(InvalidArgumentError);
    expect(() => parse("")).toThrow("--limit must be a positive integer.");
  });

  it("should use the provided name in error messages", () => {
    const parseSessions = createPositiveIntParser("--sessions", 100);
    expect(() => parseSessions("0")).toThrow("--sessions must be a positive integer.");
    expect(() => parseSessions("101")).toThrow("--sessions must be at most 100 (got 101).");
  });
});

describe("createNonNegativeIntParser", () => {
  const parse = createNonNegativeIntParser("--older-than", 3650);

  it("should parse valid non-negative integers", () => {
    expect(parse("0")).toBe(0);
    expect(parse("1")).toBe(1);
    expect(parse("90")).toBe(90);
    expect(parse("3650")).toBe(3650);
  });

  it("should reject negative numbers", () => {
    expect(() => parse("-1")).toThrow(InvalidArgumentError);
    expect(() => parse("-1")).toThrow("--older-than must be a non-negative integer.");
  });

  it("should reject non-numeric strings", () => {
    expect(() => parse("abc")).toThrow(InvalidArgumentError);
    expect(() => parse("abc")).toThrow("--older-than must be a non-negative integer.");
  });

  it("should reject values exceeding the maximum", () => {
    expect(() => parse("3651")).toThrow(InvalidArgumentError);
    expect(() => parse("3651")).toThrow("--older-than must be at most 3650 (got 3651).");
  });

  it("should reject empty string", () => {
    expect(() => parse("")).toThrow(InvalidArgumentError);
    expect(() => parse("")).toThrow("--older-than must be a non-negative integer.");
  });
});
