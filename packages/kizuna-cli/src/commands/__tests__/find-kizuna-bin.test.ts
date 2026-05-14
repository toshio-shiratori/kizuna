import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
  };
});

const mockedExecSync = vi.mocked(execSync);
const mockedExistsSync = vi.mocked(existsSync);

describe("findKizunaBin", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function loadFindKizunaBin() {
    const mod = await import("../setup.js");
    return mod.findKizunaBin;
  }

  it("should return found: true when 'which kizuna' succeeds", async () => {
    mockedExecSync.mockReturnValue("/usr/local/bin/kizuna\n");

    const findKizunaBin = await loadFindKizunaBin();
    const result = findKizunaBin();

    expect(result).toEqual({ bin: "kizuna", found: true });
    expect(mockedExecSync).toHaveBeenCalledWith("which kizuna", { encoding: "utf-8" });
  });

  it("should fall back to dev path when not in PATH", async () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("not found");
    });
    mockedExistsSync.mockReturnValue(true);

    const findKizunaBin = await loadFindKizunaBin();
    const result = findKizunaBin();

    expect(result.found).toBe(true);
    expect(result.bin).toMatch(/^node .+cli\.js$/);
  });

  it("should return found: false when neither is available", async () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("not found");
    });
    mockedExistsSync.mockReturnValue(false);

    const findKizunaBin = await loadFindKizunaBin();
    const result = findKizunaBin();

    expect(result).toEqual({ bin: "kizuna", found: false });
  });
});
