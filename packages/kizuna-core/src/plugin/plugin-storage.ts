import type BetterSqlite3 from "better-sqlite3";
import type { PluginStorage } from "../index.js";

interface PluginKvRow {
  plugin_name: string;
  key: string;
  value: string;
  updated_at: string;
}

export class SqlitePluginStorage implements PluginStorage {
  constructor(
    private readonly db: BetterSqlite3.Database,
    private readonly pluginName: string,
  ) {}

  async get<T>(key: string): Promise<T | null> {
    const row = this.db
      .prepare("SELECT value FROM plugin_kv WHERE plugin_name = ? AND key = ?")
      .get(this.pluginName, key) as Pick<PluginKvRow, "value"> | undefined;
    if (!row) return null;
    return JSON.parse(row.value) as T;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO plugin_kv (plugin_name, key, value, updated_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(this.pluginName, key, JSON.stringify(value), new Date().toISOString());
  }

  async delete(key: string): Promise<void> {
    this.db
      .prepare("DELETE FROM plugin_kv WHERE plugin_name = ? AND key = ?")
      .run(this.pluginName, key);
  }

  async list(prefix?: string): Promise<string[]> {
    if (prefix) {
      const rows = this.db
        .prepare("SELECT key FROM plugin_kv WHERE plugin_name = ? AND key LIKE ?")
        .all(this.pluginName, `${prefix}%`) as Pick<PluginKvRow, "key">[];
      return rows.map((row) => row.key);
    }
    const rows = this.db
      .prepare("SELECT key FROM plugin_kv WHERE plugin_name = ?")
      .all(this.pluginName) as Pick<PluginKvRow, "key">[];
    return rows.map((row) => row.key);
  }
}
