import { sql as sql001 } from "./001-initial.js";

export const coreMigrations: ReadonlyArray<{ version: number; sql: string }> = [
  { version: 1, sql: sql001 },
];
