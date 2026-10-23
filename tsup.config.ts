// PATH: tsup.config.ts

/**
 * TSUP CONFIGURATION: how src/ becomes the published dist/
 *
 * Purpose:
 *   One build writes an ES module and a CommonJS module, each with its own
 *   declarations, from the single entry point the exports map names:
 *
 *     src/index.ts ──► dist/index.js   + dist/index.d.ts    (import)
 *                  └─► dist/index.cjs  + dist/index.d.cts   (require)
 *
 *   The platform stays neutral, since the same files run on Node.js, Bun,
 *   Deno, edge runtimes, and React Native.
 */

import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  platform: "neutral",
  outDir: "dist",
});
