import { existsSync } from "node:fs";
import { Database } from "@kizuna/core";
import { resolveDbPath } from "../db-path.js";
import { parseInput, formatError } from "./shared.js";

export async function handleSessionStart(): Promise<void> {
  const input = parseInput();
  const dbPath = resolveDbPath(input.cwd);

  if (!existsSync(dbPath)) {
    return;
  }

  let db: Database | undefined;
  try {
    db = new Database(dbPath);
    const chunkCount = (
      db.getConnection().prepare("SELECT COUNT(*) AS count FROM chunks").get() as { count: number }
    ).count;
    const sessionCount = (
      db.getConnection().prepare("SELECT COUNT(*) AS count FROM sessions").get() as {
        count: number;
      }
    ).count;

    if (chunkCount > 0) {
      process.stderr.write(`kizuna: ${chunkCount} memories available (${sessionCount} sessions)\n`);
    }
  } catch (error) {
    process.stderr.write(`kizuna: session-start failed: ${formatError(error)}\n`);
  } finally {
    db?.close();
  }
}
