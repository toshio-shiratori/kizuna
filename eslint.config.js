import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "eslint.config.js",
            "packages/*/vitest.config.ts",
            "packages/*/vite.config.ts",
          ],
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 15,
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["packages/kizuna-web/src/client/**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        projectService: false,
        project: "./packages/kizuna-web/tsconfig.client.json",
      },
    },
  },
  {
    ignores: ["**/dist/", "**/node_modules/", "templates/"],
  },
);
