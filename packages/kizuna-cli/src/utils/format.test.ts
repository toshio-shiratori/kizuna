import { describe, it, expect } from "vitest";
import { formatBytes } from "./format.js";

describe("formatBytes", () => {
  it("returns '0 B' for zero bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("returns bytes unit for values under 1 KB", () => {
    expect(formatBytes(1)).toBe("1 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("returns KB at the 1024 boundary", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
  });

  it("returns KB for values between 1 KB and 1 MB", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(10240)).toBe("10.0 KB");
    expect(formatBytes(1024 * 1024 - 1)).toBe("1024.0 KB");
  });

  it("returns MB at the 1 MB boundary", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
  });

  it("returns MB for values above 1 MB", () => {
    expect(formatBytes(1024 * 1024 * 5)).toBe("5.0 MB");
    expect(formatBytes(1024 * 1024 * 1.5)).toBe("1.5 MB");
    expect(formatBytes(1024 * 1024 * 100)).toBe("100.0 MB");
  });

  it("handles very large values in MB", () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1024.0 MB");
    expect(formatBytes(1024 * 1024 * 10000)).toBe("10000.0 MB");
  });
});
