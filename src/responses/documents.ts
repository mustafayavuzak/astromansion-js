// PATH: src/responses/documents.ts

/**
 * DOCUMENTS: a document returned, or written to the path the caller named
 *
 * Purpose:
 *   A document comes back as it arrived unless the caller names a path, so a
 *   call never overwrites a file nobody chose:
 *
 *     output left out     ──► the bytes, or the text of a text/plain document
 *     output named        ──► the file written, and its path returned
 *     no file system      ──► ValidationError before the request, so no quota is spent
 *
 *   Node.js and Bun lend their file writer through process.getBuiltinModule,
 *   and Deno through its own global. An edge runtime, a browser page, and
 *   React Native have no file system. Finding the writer this way keeps every
 *   bundler from meeting an import of node:fs.
 */

import { CLIENT_ERROR_CODES } from "../models/constants/errors.ts";
import { ValidationError } from "../models/errors/api.ts";

/** Where the runtime's file writer is found. */
const DOCUMENTS_CONFIG = Object.freeze({
  /** The module Node.js and Bun lend their promise-based file functions from. */
  FILE_MODULE: "node:fs/promises",
  /** The refusal of a path where nothing can be written. */
  NO_FILE_SYSTEM:
    "output needs a file system, and this runtime has none. Leave output out to get the bytes.",
} as const);

/**
 * Write a document's content to a path.
 *
 * @internal
 */
export type DocumentWriter = (
  path: string,
  content: Uint8Array | string,
) => Promise<void>;

/**
 * Find the runtime's file writer, before the request is sent.
 *
 * @internal
 * @param output - The path the caller named, or undefined to keep the document in memory.
 * @returns The writer, or undefined when no path was named.
 * @throws {@link ValidationError} when a path was named and the runtime has no file system.
 *
 * @example
 * ```ts
 * documentWriter(undefined);     // undefined, the document stays in memory
 * documentWriter("chart.pdf");   // the writer on Node.js, Bun, and Deno
 * documentWriter("chart.pdf");   // throws ValidationError on an edge runtime or in React Native
 * ```
 */
export function documentWriter(
  output: string | undefined,
): DocumentWriter | undefined {
  if (output === undefined) {
    return undefined;
  }
  const writer = nodeWriter() ?? denoWriter();
  if (writer === undefined) {
    throw new ValidationError(DOCUMENTS_CONFIG.NO_FILE_SYSTEM, {
      errorCode: CLIENT_ERROR_CODES.VALIDATION,
    });
  }
  return writer;
}

/**
 * Return a document, or the path it was written to.
 *
 * @internal
 * @param content - The document the API sent.
 * @param output - The path to write it to, or undefined to keep it.
 * @param writer - The writer documentWriter found for that path.
 * @returns The content, or the path written.
 *
 * @example
 * ```ts
 * await saveDocument(bytes, undefined, undefined);    // bytes
 * await saveDocument(bytes, "chart.pdf", writer);     // "chart.pdf", the file written
 * ```
 */
export async function saveDocument(
  content: Uint8Array | string,
  output: string | undefined,
  writer: DocumentWriter | undefined,
): Promise<Uint8Array | string> {
  if (output === undefined || writer === undefined) {
    return content;
  }
  await writer(output, content);
  return output;
}

/**
 * Find the writer Node.js and Bun lend.
 *
 * @returns The writer, or undefined when the runtime lends none.
 */
function nodeWriter(): DocumentWriter | undefined {
  const runtimeProcess: unknown = Reflect.get(globalThis, "process");
  if (typeof runtimeProcess !== "object" || runtimeProcess === null) {
    return undefined;
  }
  const lend: unknown = Reflect.get(runtimeProcess, "getBuiltinModule");
  if (typeof lend !== "function") {
    return undefined;
  }
  const files: unknown = Reflect.apply(lend, runtimeProcess, [
    DOCUMENTS_CONFIG.FILE_MODULE,
  ]);
  if (typeof files !== "object" || files === null) {
    return undefined;
  }
  const writeFile: unknown = Reflect.get(files, "writeFile");
  if (typeof writeFile !== "function") {
    return undefined;
  }
  return async (path, content) => {
    const written: unknown = Reflect.apply(writeFile, files, [path, content]);
    await Promise.resolve(written);
  };
}

/**
 * Find the writer Deno lends.
 *
 * @returns The writer, or undefined outside Deno.
 */
function denoWriter(): DocumentWriter | undefined {
  const deno: unknown = Reflect.get(globalThis, "Deno");
  if (typeof deno !== "object" || deno === null) {
    return undefined;
  }
  const writeFile: unknown = Reflect.get(deno, "writeFile");
  if (typeof writeFile !== "function") {
    return undefined;
  }
  return async (path, content) => {
    const bytes =
      typeof content === "string" ? new TextEncoder().encode(content) : content;
    const written: unknown = Reflect.apply(writeFile, deno, [path, bytes]);
    await Promise.resolve(written);
  };
}
