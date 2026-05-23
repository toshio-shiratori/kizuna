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
          maximumDefaultProjectFileMatchCount_THIS_WILL_SLOW_DOWN_LINTING: 12,
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: ["**/dist/", "**/node_modules/", "templates/", "packages/kizuna-web/src/client/"],
  },
);
