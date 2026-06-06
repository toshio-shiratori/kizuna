import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "server",
          include: ["src/server/**/*.test.ts"],
        },
      },
      {
        plugins: [react()],
        // @vitejs/plugin-react 6's Babel transform does not run under Vitest,
        // so JSX falls back to esbuild's classic runtime (which needs React in
        // scope). Force esbuild's automatic runtime so tests need no React import.
        esbuild: { jsx: "automatic", jsxImportSource: "react" },
        test: {
          name: "client",
          environment: "jsdom",
          include: ["src/client/**/*.test.tsx"],
          setupFiles: ["src/client/vitest.setup.ts"],
        },
      },
    ],
  },
});
