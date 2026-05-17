import type { Command } from "commander";
import { resolve } from "node:path";
import { runPluginMigrationsForProject } from "./run-migrations.js";

export function registerInit(pluginCmd: Command): void {
  pluginCmd
    .command("init")
    .description("Run migrations for all enabled plugins")
    .option("--cwd <path>", "Project directory", process.cwd())
    .action(async (opts: { cwd: string }) => {
      const cwd = resolve(opts.cwd);

      const result = await runPluginMigrationsForProject(cwd);
      if (result.ran) {
        if (result.failedCount > 0) {
          console.error(
            `Plugin migrations: ${result.failedCount} of ${result.pluginCount} plugin(s) failed.`,
          );
          process.exitCode = 1;
        } else {
          console.log(`Plugin migrations complete. ${result.pluginCount} plugin(s) initialized.`);
        }
      } else {
        console.log("No enabled plugins found. Nothing to do.");
      }
    });
}
