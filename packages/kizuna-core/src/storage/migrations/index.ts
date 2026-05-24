import { sql as sql001 } from "./001-initial.js";
import { sql as sql002 } from "./002-reports.js";

export const coreMigrations: ReadonlyArray<{ version: number; sql: string }> = [
  { version: 1, sql: sql001 },
  { version: 2, sql: sql002 },
];
