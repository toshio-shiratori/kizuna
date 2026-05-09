import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "../storage/database.js";
import { SqlitePluginStorage } from "./plugin-storage.js";

let database: Database;
let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "kizuna-plugin-storage-test-"));
  database = new Database(join(dir, "test.db"));
});

afterEach(() => {
  database.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("SqlitePluginStorage", () => {
  it("returns null for a missing key", async () => {
    const storage = new SqlitePluginStorage(database.db, "test-plugin");
    expect(await storage.get("nonexistent")).toBeNull();
  });

  it("roundtrips string values", async () => {
    const storage = new SqlitePluginStorage(database.db, "test-plugin");
    await storage.set("key1", "hello");
    expect(await storage.get("key1")).toBe("hello");
  });

  it("roundtrips number values", async () => {
    const storage = new SqlitePluginStorage(database.db, "test-plugin");
    await storage.set("num", 42);
    expect(await storage.get("num")).toBe(42);
  });

  it("roundtrips object values", async () => {
    const storage = new SqlitePluginStorage(database.db, "test-plugin");
    const obj = { foo: 1, bar: [2, 3] };
    await storage.set("obj", obj);
    expect(await storage.get("obj")).toEqual(obj);
  });

  it("roundtrips null values", async () => {
    const storage = new SqlitePluginStorage(database.db, "test-plugin");
    await storage.set("nullable", null);
    expect(await storage.get("nullable")).toBeNull();
  });

  it("overwrites existing keys (upsert)", async () => {
    const storage = new SqlitePluginStorage(database.db, "test-plugin");
    await storage.set("key", "old");
    await storage.set("key", "new");
    expect(await storage.get("key")).toBe("new");
  });

  it("deletes a key", async () => {
    const storage = new SqlitePluginStorage(database.db, "test-plugin");
    await storage.set("key", "value");
    await storage.delete("key");
    expect(await storage.get("key")).toBeNull();
  });

  it("delete on nonexistent key is a no-op", async () => {
    const storage = new SqlitePluginStorage(database.db, "test-plugin");
    await storage.delete("nonexistent");
  });

  it("lists all keys", async () => {
    const storage = new SqlitePluginStorage(database.db, "test-plugin");
    await storage.set("alpha", 1);
    await storage.set("beta", 2);
    await storage.set("gamma", 3);
    const keys = await storage.list();
    expect(keys.sort()).toEqual(["alpha", "beta", "gamma"]);
  });

  it("lists keys with prefix filter", async () => {
    const storage = new SqlitePluginStorage(database.db, "test-plugin");
    await storage.set("cache:a", 1);
    await storage.set("cache:b", 2);
    await storage.set("config:x", 3);
    const keys = await storage.list("cache:");
    expect(keys.sort()).toEqual(["cache:a", "cache:b"]);
  });

  it("isolates keys between different plugin names", async () => {
    const storageA = new SqlitePluginStorage(database.db, "plugin-a");
    const storageB = new SqlitePluginStorage(database.db, "plugin-b");

    await storageA.set("shared-key", "from-a");
    await storageB.set("shared-key", "from-b");

    expect(await storageA.get("shared-key")).toBe("from-a");
    expect(await storageB.get("shared-key")).toBe("from-b");

    await storageA.delete("shared-key");
    expect(await storageA.get("shared-key")).toBeNull();
    expect(await storageB.get("shared-key")).toBe("from-b");
  });

  it("list returns empty array when no keys exist", async () => {
    const storage = new SqlitePluginStorage(database.db, "empty-plugin");
    expect(await storage.list()).toEqual([]);
  });

  it("list with prefix returns empty array when no match", async () => {
    const storage = new SqlitePluginStorage(database.db, "test-plugin");
    await storage.set("other:key", 1);
    expect(await storage.list("miss:")).toEqual([]);
  });
});
