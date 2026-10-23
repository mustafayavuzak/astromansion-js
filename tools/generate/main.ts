// PATH: tools/generate/main.ts

/**
 * GENERATE: writes the SDK's generated modules from the API's schema
 *
 * Usage:
 *   npm run generate                          the live schema, https://api.astromansion.com/openapi.json
 *   npm run generate -- path/to/schema.json   a saved schema
 *   npm run generate -- https://…/openapi.json
 *
 *   The schema is saved as tools/generate/openapi.v1.json, the snapshot the
 *   drift test reads, and the modules generatedFiles.ts lists are written
 *   from it. A schema the generator cannot write stops the run before any
 *   file is written, and the error names its place in the document. Node.js
 *   runs this file as written, since its syntax is erasable.
 *
 * Writing:
 *   Each module's directory is made first, then the files are written one
 *   after another. A failed write stops the run there and leaves the later
 *   files as they were. Running again writes every file.
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { GENERATED_PATHS, generatedFiles } from "./generatedFiles.ts";

/** Where the generator reads the schema from when it is told nothing. */
const MAIN_CONFIG = Object.freeze({
  /** The live schema. */
  SCHEMA_URL: "https://api.astromansion.com/openapi.json",
  /** The agent the generator identifies itself with, since the API refuses an anonymous one. */
  USER_AGENT: "astromansion-sdk-generator",
  /** The longest the schema may take to arrive, in milliseconds. */
  SCHEMA_TIMEOUT_MS: 30_000,
  /** The prefix that marks a source as an address rather than a file. */
  ADDRESS_PREFIX: "http",
} as const);

const root = join(import.meta.dirname, "..", "..");
const [source = MAIN_CONFIG.SCHEMA_URL] = process.argv.slice(2);
const snapshot = source.startsWith(MAIN_CONFIG.ADDRESS_PREFIX)
  ? await fetchSchema(source)
  : await readFile(source, "utf8");
const files = [
  { path: GENERATED_PATHS.SNAPSHOT, text: snapshot },
  ...(await generatedFiles(snapshot, root)),
];
await Promise.all(
  files.map((file) =>
    mkdir(dirname(join(root, file.path)), { recursive: true }),
  ),
);
for (const file of files) {
  // One after another, so a failed write stops before the next file is opened.
  await writeFile(join(root, file.path), file.text, "utf8");
}
process.stdout.write(`wrote ${files.map((file) => file.path).join(", ")}\n`);

/**
 * Fetch the schema from an address.
 *
 * @param address - The schema's address.
 * @returns The schema's text.
 * @throws Error when the address answers with anything but 200.
 */
async function fetchSchema(address: string): Promise<string> {
  const response = await fetch(address, {
    headers: { "User-Agent": MAIN_CONFIG.USER_AGENT },
    signal: AbortSignal.timeout(MAIN_CONFIG.SCHEMA_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(
      `${address} answered ${String(response.status)}, not the schema`,
    );
  }
  return response.text();
}
