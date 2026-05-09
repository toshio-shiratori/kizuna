#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

const dbPath = process.env["KIZUNA_DB_PATH"];
if (!dbPath) {
  process.stderr.write("Error: KIZUNA_DB_PATH environment variable is required.\n");
  process.exit(1);
}

const server = createServer({ dbPath });
const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write("Kizuna MCP server running on stdio\n");
