import { existsSync } from "node:fs";
import { resolve } from "node:path";

const DEFAULT_DB_DIR = ".kizuna";
const DEFAULT_DB_NAME = "memory.db";

export function resolveDbPath(cwd: string = process.cwd()): string {
  return resolve(cwd, DEFAULT_DB_DIR, DEFAULT_DB_NAME);
}

export function dbExists(cwd: string = process.cwd()): boolean {
  return existsSync(resolveDbPath(cwd));
}
