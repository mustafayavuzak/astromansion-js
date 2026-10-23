// PATH: tests/vitest.config.ts

/**
 * VITEST CONFIGURATION: how the suite finds and runs its tests
 *
 * Purpose:
 *   The suite lives in tests/, beside this file, and mirrors src/. The root
 *   stays the repository root, so a test resolves package.json and src/
 *   exactly as the build does.
 *
 * Isolation:
 *   Every test starts from the real globals, environment variables, and
 *   timers. A stub or a fake installed by one test is undone before the next.
 */

import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  root: fileURLToPath(new URL("..", import.meta.url)),
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
});
