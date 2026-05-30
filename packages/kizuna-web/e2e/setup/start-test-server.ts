import { execSync } from "node:child_process";
import { mkdtempSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";

const PORT = Number(process.env.E2E_PORT ?? 4101);
const REPO_ROOT = resolve(import.meta.dirname, "../../../..");

function ensureClientAndDepsBuilt(): string {
  const clientDir = resolve(import.meta.dirname, "../../dist/client");
  const coreDist = resolve(REPO_ROOT, "packages/kizuna-core/dist/index.js");
  // tsx resolves package exports at module load time, so workspace deps must
  // exist before any `import "@kizuna/*"` runs. We check the cheapest signals
  // (the client index.html and core's built entry) and build all packages if
  // either is missing.
  if (!existsSync(join(clientDir, "index.html")) || !existsSync(coreDist)) {
    console.log("[e2e] build artefacts missing, running 'pnpm -r build'...");
    execSync("pnpm -r build", { cwd: REPO_ROOT, stdio: "inherit" });
  }
  return clientDir;
}

async function main(): Promise<void> {
  const clientDir = ensureClientAndDepsBuilt();

  // Deferred so the build above completes before workspace deps are resolved.
  const { serve } = await import("@hono/node-server");
  const { Database } = await import("@kizuna/core");
  const { createApp } = await import("../../src/server/index.js");

  // Shared seed + read-only assertions. The server runs with write: true so
  // future specs CAN mutate, but the current suite intentionally does not —
  // adding any mutation must come with per-test DB reset.
  const tempDir = mkdtempSync(join(tmpdir(), "kizuna-e2e-"));
  const dbPath = join(tempDir, "memory.db");

  const seedDb = new Database(dbPath);
  seedDb.insertSession({
    id: "e2e-session-1",
    projectId: "e2e-project-alpha",
    startedAt: "2026-01-01T00:00:00Z",
    endedAt: "2026-01-01T01:00:00Z",
    transcriptPath: null,
    metadata: {},
  });
  seedDb.insertChunk({
    sessionId: "e2e-session-1",
    turnIndex: 0,
    role: "user",
    content: "Hello from the E2E user turn.",
    metadata: {},
    createdAt: "2026-01-01T00:00:00Z",
  });
  seedDb.insertChunk({
    sessionId: "e2e-session-1",
    turnIndex: 1,
    role: "assistant",
    content: "This is a unique e2ekeyword response for search.",
    metadata: {},
    createdAt: "2026-01-01T00:30:00Z",
  });
  seedDb.insertSession({
    id: "e2e-session-2",
    projectId: "e2e-project-beta",
    startedAt: "2026-02-01T00:00:00Z",
    endedAt: "2026-02-01T01:00:00Z",
    transcriptPath: null,
    metadata: {},
  });
  seedDb.insertChunk({
    sessionId: "e2e-session-2",
    turnIndex: 0,
    role: "user",
    content: "Second session content.",
    metadata: {},
    createdAt: "2026-02-01T00:00:00Z",
  });
  seedDb.close();

  const { app, db } = createApp(clientDir, { dbPath, write: true });

  const server = serve(
    {
      fetch: app.fetch,
      port: PORT,
      hostname: "127.0.0.1",
    },
    () => {
      console.log(`[e2e] test server listening on http://127.0.0.1:${PORT} (db: ${dbPath})`);
    },
  );

  const shutdown = (): void => {
    server.close(() => {
      db.close();
      rmSync(tempDir, { recursive: true, force: true });
      process.exit(0);
    });
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((err: unknown) => {
  console.error("[e2e] failed to start test server:", err);
  process.exit(1);
});
