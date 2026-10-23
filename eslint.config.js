// PATH: eslint.config.js

/**
 * ESLINT CONFIGURATION: the one lint configuration of the repository
 *
 * Purpose:
 *   Every TypeScript file, the package, its tests, its tools, and its
 *   configuration, is linted with type information. The sets are
 *   typescript-eslint's strictTypeChecked and stylisticTypeChecked, with the
 *   exhaustive switch check and import-x's cycle check turned on. This file is
 *   plain JavaScript and is linted without types.
 *
 * Resolution:
 *   Relative imports name their file with its .ts extension, so the plugin's
 *   own Node.js resolver finds every module the cycle check follows.
 */

import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import { createNodeResolver, importX } from "eslint-plugin-import-x";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["dist/", "node_modules/", "coverage/"] },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { "import-x": importX },
    settings: {
      "import-x/extensions": [".ts", ".js"],
      "import-x/parsers": { "@typescript-eslint/parser": [".ts"] },
      "import-x/resolver-next": [createNodeResolver()],
    },
    rules: {
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      "import-x/no-cycle": "error",
    },
  },
  {
    files: ["**/*.js"],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
