import type BetterSqlite3 from "better-sqlite3";
import type { Migration, Logger } from "../index.js";

export function runPluginMigrations(
  db: BetterSqlite3.Database,
  pluginName: string,
  migrations: Migration[],
  logger: Logger,
): void {
  const applied = new Set(
    db
      .prepare("SELECT version FROM schema_versions WHERE component = ?")
      .all(pluginName)
      .map((row) => (row as { version: number }).version),
  );

  const sorted = [...migrations].sort((a, b) => a.version - b.version);

  for (const migration of sorted) {
    if (applied.has(migration.version)) continue;

    logger.info(`Running migration v${migration.version}: ${migration.description}`);

    db.transaction(() => {
      db.exec(migration.up);
      db.prepare(
        "INSERT INTO schema_versions (component, version, applied_at) VALUES (?, ?, ?)",
      ).run(pluginName, migration.version, new Date().toISOString());
    })();
  }
}
