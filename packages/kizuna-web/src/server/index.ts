import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { apiRoutes } from "./routes/api.js";

export interface ServerOptions {
  port: number;
  dbPath: string;
  write: boolean;
}

export function createApp(clientDir: string): Hono {
  const app = new Hono();

  app.route("/api", apiRoutes);

  app.use(
    "/*",
    serveStatic({
      root: clientDir,
      rewriteRequestPath: (path) => path,
    }),
  );

  const indexHtml = readFileSync(resolve(clientDir, "index.html"), "utf-8");
  app.get("/*", (c) => c.html(indexHtml));

  return app;
}

export function startServer(options: ServerOptions) {
  const clientDir = resolve(import.meta.dirname, "../client");
  const app = createApp(clientDir);

  const server = serve(
    {
      fetch: app.fetch,
      port: options.port,
      hostname: "127.0.0.1",
    },
    () => {
      console.log(`Kizuna Web running at http://127.0.0.1:${options.port}`);
    },
  );

  return server;
}
