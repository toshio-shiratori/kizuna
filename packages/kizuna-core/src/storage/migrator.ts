import type BetterSqlite3 from "better-sqlite3";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const MIGRATIONS_DIR = join(
  fileURLToPath(import.meta.url),
  "..",
  "migrations",
);

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

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  for (const file of files) {
    const version = parseInt(file.split("-")[0]!, 10);
    if (applied.has(version)) continue;

    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf-8");

    db.transaction(() => {
      db.exec(sql);
      db.prepare(
        "INSERT INTO schema_versions (component, version, applied_at) VALUES (?, ?, ?)",
      ).run("core", version, new Date().toISOString());
    })();
  }
}
