// PATH: .meta/tools/generate/generatedFiles.ts

/**
 * GENERATED FILES: the modules one snapshot produces, formatted
 *
 * Purpose:
 *   The one place that turns the snapshot into the generated modules. The
 *   generator writes what it returns, and the drift test compares the
 *   committed modules with it, so both go through the same steps:
 *
 *     snapshot text ──► readOpenApi ──► sdkOperations ──► the three writers ──► Prettier
 *
 *     src/models/schemas/api.ts       the shapes
 *     src/responses/answerChecks.ts   the answer checks
 *     src/endpointMethods.ts          the methods
 */

import { join } from "node:path";
import { format, resolveConfig } from "prettier";
import { renderAnswerChecks } from "./checkWriter.ts";
import { renderEndpointMethods } from "./methodWriter.ts";
import { readOpenApi } from "./openApi.ts";
import { answerReach, methodReach, sdkOperations } from "./operations.ts";
import { ShapeCatalog } from "./shapes.ts";
import { renderSchemaTypes } from "./typeWriter.ts";

/** Where the snapshot and the generated modules sit, from the repository's root. */
export const GENERATED_PATHS = Object.freeze({
  /** The snapshot of the API's schema, the generator's one input. */
  SNAPSHOT: ".meta/openapi/openapi.v1.json",
  /** The shapes. */
  SCHEMAS: "src/models/schemas/api.ts",
  /** The answer checks. */
  CHECKS: "src/responses/answerChecks.ts",
  /** The methods. */
  METHODS: "src/endpointMethods.ts",
} as const);

/** One generated module. */
export interface GeneratedFile {
  /** Where it sits, from the repository's root. */
  readonly path: string;
  /** Its text, formatted. */
  readonly text: string;
}

/**
 * Produce the generated modules from a snapshot.
 *
 * @remarks
 * Nothing is written. The caller decides whether to write the modules or
 * to compare them. The promise rejects with a {@link GeneratorError} when
 * the snapshot holds what the generator cannot write.
 *
 * @param snapshot - The snapshot's text.
 * @param root - The repository's root, where Prettier finds its configuration.
 * @returns The modules, formatted, in the order of GENERATED_PATHS.
 *
 * @example
 * ```ts
 * const files = await generatedFiles(await readFile(GENERATED_PATHS.SNAPSHOT, "utf8"), process.cwd());
 * files.map((file) => file.path);   // the schemas, the checks, and the methods
 * ```
 */
export async function generatedFiles(
  snapshot: string,
  root: string,
): Promise<readonly GeneratedFile[]> {
  const document = readOpenApi(snapshot);
  const catalog = new ShapeCatalog(document.components);
  const methods = sdkOperations(document, catalog);
  const answers = answerReach(methods, catalog);
  const files: readonly GeneratedFile[] = [
    {
      path: GENERATED_PATHS.SCHEMAS,
      text: renderSchemaTypes(
        methods,
        catalog,
        methodReach(methods, catalog),
        answers,
      ),
    },
    {
      path: GENERATED_PATHS.CHECKS,
      text: renderAnswerChecks(methods, catalog, answers),
    },
    { path: GENERATED_PATHS.METHODS, text: renderEndpointMethods(methods) },
  ];
  return Promise.all(
    files.map(async (file) => ({
      path: file.path,
      text: await formatted(file, root),
    })),
  );
}

/**
 * Format a module as the repository's Prettier formats it.
 *
 * @param file - The module, before formatting.
 * @param root - The repository's root.
 * @returns The formatted text.
 */
async function formatted(file: GeneratedFile, root: string): Promise<string> {
  const filepath = join(root, file.path);
  const options = await resolveConfig(filepath);
  return format(file.text, { ...options, filepath });
}
