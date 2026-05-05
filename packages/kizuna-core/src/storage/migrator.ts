import type BetterSqlite3 from "better-sqlite3";
import { coreMigrations } from "./migrations/index.js";

export function runCoreMigrations(db: BetterSqlite3.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_versions (
      component TEXT NOT NULL,
      version INTEGER NOT NULL,
      applied_at TEXT NOT NULL,
      PRIMARY KEY (component, version)
    );
  `);

  const applied = new Set(
    db
      .prepare(
        "SELECT version FROM schema_versions WHERE component = 'core'",
      )
      .all()
      .map((row) => (row as { version: number }).version),
  );

  for (const migration of coreMigrations) {
    if (applied.has(migration.version)) continue;

    db.transaction(() => {
      db.exec(migration.sql);
      db.prepare(
        "INSERT INTO schema_versions (component, version, applied_at) VALUES (?, ?, ?)",
      ).run("core", migration.version, new Date().toISOString());
    })();
  }
}
