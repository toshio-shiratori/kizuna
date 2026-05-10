import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Database } from "../storage/database.js";
import { captureTranscript } from "./capture.js";
import { searchMemory } from "./search.js";
import { injectMemory } from "./inject.js";
import { estimateTokens } from "./chunker.js";
import { preprocessQuery } from "./cjk-preprocessing.js";

function makeTranscript(turnCount: number): string {
  const lines: string[] = [];
  for (let i = 0; i < turnCount; i++) {
    const role = i % 2 === 0 ? "user" : "assistant";
    const content =
      role === "user"
        ? `質問${i}: SQLiteのFTS5でトリグラムトークナイザーを使う場合の注意点を教えてください`
        : `回答${i}: FTS5のトリグラムトークナイザーはCJKテキストに適しています。インデックスサイズが大きくなる点に注意が必要です。`;
    lines.push(
      JSON.stringify({
        type: role === "user" ? "user" : "assistant",
        uuid: `uuid-${i}`,
        timestamp: new Date(2025, 0, 1, 0, i).toISOString(),
        sessionId: "bench-session",
        message: { role, content },
      }),
    );
  }
  return lines.join("\n");
}

describe("Performance baselines", () => {
  let db: Database;
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "kizuna-bench-"));
    db = new Database(join(dir, "bench.db"));

    for (let s = 0; s < 10; s++) {
      await captureTranscript(db, {
        sessionId: `bench-session-${s}`,
        projectId: "bench-project",
        transcriptContent: makeTranscript(20),
      });
    }
  });

  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("captureTranscript: 100 turns under 200ms", async () => {
    const transcript = makeTranscript(100);
    const start = performance.now();
    await captureTranscript(db, {
      sessionId: "perf-capture",
      projectId: "bench-project",
      transcriptContent: transcript,
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
  });

  it("searchMemory: query against 200 chunks under 50ms", async () => {
    const start = performance.now();
    const results = await searchMemory(db, {
      text: "FTS5 トリグラム インデックス",
      limit: 10,
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
    expect(results.length).toBeGreaterThan(0);
  });

  it("injectMemory: search + format under 50ms", async () => {
    const start = performance.now();
    const result = await injectMemory(db, "SQLiteのFTS5について教えて");
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(50);
    expect(result.chunksUsed).toBeGreaterThan(0);
  });

  it("estimateTokens: 10000 chars under 1ms", () => {
    const text = "日本語テスト".repeat(1667);
    const start = performance.now();
    estimateTokens(text);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1);
  });

  it("preprocessQuery: CJK trigram under 1ms", () => {
    const query = "SQLiteのFTS5でトリグラムトークナイザーを使う場合の注意点";
    const start = performance.now();
    preprocessQuery(query);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(1);
  });

  it("captureTranscript with transaction is faster than baseline", async () => {
    const transcript = makeTranscript(50);
    const times: number[] = [];
    for (let i = 0; i < 3; i++) {
      const start = performance.now();
      await captureTranscript(db, {
        sessionId: `perf-txn-${i}`,
        projectId: "bench-project",
        transcriptContent: transcript,
      });
      times.push(performance.now() - start);
    }
    const avg = times.reduce((a, b) => a + b, 0) / times.length;
    expect(avg).toBeLessThan(150);
  });
});

describe("Scale performance (2000 chunks)", () => {
  let db: Database;
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "kizuna-bench-2k-"));
    db = new Database(join(dir, "bench.db"));

    for (let s = 0; s < 100; s++) {
      await captureTranscript(db, {
        sessionId: `scale-session-${s}`,
        projectId: "scale-project",
        transcriptContent: makeTranscript(20),
      });
    }
  });

  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("searchMemory: 2000 chunks under 100ms", async () => {
    const start = performance.now();
    const results = await searchMemory(db, {
      text: "FTS5 トリグラム インデックス",
      limit: 10,
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
    expect(results.length).toBeGreaterThan(0);
  });

  it("injectMemory: 2000 chunks under 100ms", async () => {
    const start = performance.now();
    const result = await injectMemory(db, "SQLiteのFTS5について教えて");
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
    expect(result.chunksUsed).toBeGreaterThan(0);
  });

  it("searchMemory with filters: 2000 chunks under 100ms", async () => {
    const start = performance.now();
    const results = await searchMemory(db, {
      text: "FTS5 トリグラム",
      limit: 10,
      filters: { projectIds: ["scale-project"] },
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(100);
    expect(results.length).toBeGreaterThan(0);
  });
});

describe("Scale performance (5000 chunks)", () => {
  let db: Database;
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "kizuna-bench-5k-"));
    db = new Database(join(dir, "bench.db"));

    for (let s = 0; s < 250; s++) {
      await captureTranscript(db, {
        sessionId: `scale-session-${s}`,
        projectId: `project-${s % 5}`,
        transcriptContent: makeTranscript(20),
      });
    }
  });

  afterAll(() => {
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("searchMemory: 5000 chunks under 200ms", async () => {
    const start = performance.now();
    const results = await searchMemory(db, {
      text: "FTS5 トリグラム インデックス",
      limit: 10,
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
    expect(results.length).toBeGreaterThan(0);
  });

  it("injectMemory: 5000 chunks under 200ms", async () => {
    const start = performance.now();
    const result = await injectMemory(db, "SQLiteのFTS5について教えて");
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
    expect(result.chunksUsed).toBeGreaterThan(0);
  });

  it("searchMemory with project filter: 5000 chunks under 200ms", async () => {
    const start = performance.now();
    const results = await searchMemory(db, {
      text: "FTS5 トリグラム",
      limit: 10,
      filters: { projectIds: ["project-0", "project-1"] },
    });
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(200);
    expect(results.length).toBeGreaterThan(0);
  });

  it("estimateTokens: 50000 chars under 2ms", () => {
    const text = "日本語テスト mixed content テスト".repeat(3125);
    const start = performance.now();
    estimateTokens(text);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2);
  });

  it("preprocessQuery: long CJK query under 2ms", () => {
    const query =
      "SQLiteのFTS5でトリグラムトークナイザーを使う場合の注意点を教えてください。日本語のテキスト検索に最適な設定は何ですか";
    const start = performance.now();
    preprocessQuery(query);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2);
  });
});
