import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@kizuna/core": resolve(__dirname, "../kizuna-core/src/index.ts"),
    },
  },
});
