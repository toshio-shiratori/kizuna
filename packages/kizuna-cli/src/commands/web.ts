import type { Command } from "commander";
import { resolveDbPath } from "../db-path.js";

const DEFAULT_PORT = 4100;

export function registerWeb(program: Command): void {
  program
    .command("web")
    .description("Start the Kizuna Web UI server")
    .option("--port <port>", "Port number", String(DEFAULT_PORT))
    .option("--write", "Enable write operations", false)
    .option("--cwd <path>", "Project directory", process.cwd())
    .action(async (opts: { port: string; write: boolean; cwd: string }) => {
      const port = parseInt(opts.port, 10);
      if (Number.isNaN(port) || port < 1 || port > 65535) {
        console.error("Invalid port number. Must be between 1 and 65535.");
        process.exitCode = 1;
        return;
      }

      const dbPath = resolveDbPath(opts.cwd);

      let startServer: (options: { port: number; dbPath: string; write: boolean }) => unknown;
      try {
        ({ startServer } = await import("@kizuna/web"));
      } catch {
        console.error("@kizuna/web is not installed. Install it with: pnpm add @kizuna/web");
        process.exitCode = 1;
        return;
      }

      startServer({ port, dbPath, write: opts.write });
    });
}
