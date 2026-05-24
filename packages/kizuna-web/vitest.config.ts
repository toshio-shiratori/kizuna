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
