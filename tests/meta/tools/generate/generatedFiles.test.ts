// PATH: tests/meta/tools/generate/generatedFiles.test.ts

/**
 * GENERATED FILES TEST: the committed modules are what the snapshot generates
 *
 * Purpose:
 *   A generated module is never edited by hand. The generator runs here in
 *   memory over the committed snapshot, and its output must equal the
 *   committed modules byte for byte. A hand edit fails, and so does a
 *   snapshot changed without `npm run generate`.
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  GENERATED_PATHS,
  generatedFiles,
} from "../../../../.meta/tools/generate/generatedFiles.ts";

/** The repository's root, where the snapshot and the modules sit. */
const ROOT = fileURLToPath(new URL("../../../../", import.meta.url));

/** What the generator writes from the committed snapshot. */
const FILES = await generatedFiles(
  await readFile(join(ROOT, GENERATED_PATHS.SNAPSHOT), "utf8"),
  ROOT,
);

describe("the generated modules", () => {
  it.each(FILES.map((file) => [file.path, file.text] as const))(
    "%s is what the snapshot generates",
    async (path, text) => {
      expect(await readFile(join(ROOT, path), "utf8")).toBe(text);
    },
  );
});
