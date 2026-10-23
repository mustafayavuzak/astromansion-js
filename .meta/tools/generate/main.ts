// PATH: .meta/tools/generate/main.ts

/**
 * GENERATE: writes the SDK's generated modules from the API schema snapshot
 *
 * Usage:
 *   npm run generate
 *
 *   Reads .meta/openapi/openapi.v1.json and writes the modules that
 *   generatedFiles.ts lists. A schema the generator cannot write stops the
 *   run before any module is written, and the error names its place in the
 *   document. Node.js runs this file as written, since its syntax is
 *   erasable.
 *
 * Writing:
 *   Each module's directory is made first, then the modules are written
 *   one after another. A failed write stops the run there and leaves the
 *   later modules as they were. Running again writes every module.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { GENERATED_PATHS, generatedFiles } from "./generatedFiles.ts";

const root = join(import.meta.dirname, "..", "..", "..");
const snapshot = await readFile(join(root, GENERATED_PATHS.SNAPSHOT), "utf8");
const files = await generatedFiles(snapshot, root);
await Promise.all(
  files.map((file) =>
    mkdir(dirname(join(root, file.path)), { recursive: true }),
  ),
);
for (const file of files) {
  // One after another, so a failed write stops before the next module is opened.
  await writeFile(join(root, file.path), file.text, "utf8");
}
process.stdout.write(`wrote ${files.map((file) => file.path).join(", ")}\n`);
