#!/usr/bin/env node
import { dirname } from "node:path";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { Database, loadPluginManager } from "@kizuna/core";
import { createServer } from "./server.js";

const dbPath = process.env["KIZUNA_DB_PATH"];
if (!dbPath) {
  process.stderr.write("Error: KIZUNA_DB_PATH environment variable is required.\n");
  process.exit(1);
}

const projectDir = process.env["KIZUNA_PROJECT_DIR"] ?? dirname(dirname(dbPath));

const stderrLogger = {
  debug() {},
  info(message: string) {
    process.stderr.write(`kizuna-mcp: ${message}\n`);
  },
  warn(message: string) {
    process.stderr.write(`kizuna-mcp: warn: ${message}\n`);
  },
  error(message: string) {
    process.stderr.write(`kizuna-mcp: error: ${message}\n`);
  },
};

const db = new Database(dbPath);
const pluginManager = await loadPluginManager(db.db, projectDir, { logger: stderrLogger });

if (pluginManager) {
  const names = pluginManager.getPlugins().map((e) => e.plugin.name);
  stderrLogger.info(`Plugins loaded: ${names.join(", ")}`);
}

const server = createServer({ dbPath, pluginManager });
const transport = new StdioServerTransport();
await server.connect(transport);
stderrLogger.info("Kizuna MCP server running on stdio");

async function shutdown() {
  if (pluginManager) {
    await pluginManager.shutdownAll();
  }
  db.close();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
