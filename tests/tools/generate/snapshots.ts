// PATH: tests/tools/generate/snapshots.ts

/**
 * SNAPSHOTS: small schema snapshots the generator's tests write
 *
 * Purpose:
 *   A test of the generator states the few paths and components its case
 *   needs, and this module wraps them into the text of a whole snapshot,
 *   so no test copies the document's frame.
 */

/** A JSON object of a snapshot, as a test writes it. */
export type Members = Readonly<Record<string, unknown>>;

/**
 * Write a snapshot's text from its paths and its component schemas.
 *
 * @param paths - The paths member.
 * @param schemas - The component schemas.
 * @returns The snapshot's text.
 *
 * @example
 * ```ts
 * readOpenApi(snapshot({}, { Theme: { enum: ["light", "dark"] } }));
 * ```
 */
export function snapshot(paths: Members, schemas: Members = {}): string {
  return JSON.stringify({
    openapi: "3.1.0",
    info: { title: "AstroMansion API", version: "1.0.0" },
    paths,
    components: { schemas },
  });
}

/**
 * Write a path item of one operation that answers its success with a schema.
 *
 * @param verb - The operation's method, as the document writes it.
 * @param operationId - The operation's id.
 * @param answer - The success's schema.
 * @param more - Further members of the operation, such as its parameters or body.
 * @returns The path item.
 *
 * @example
 * ```ts
 * snapshot({ "/v1/natal": answering("post", "natal", { $ref: "#/components/schemas/NatalResponse" }) });
 * ```
 */
export function answering(
  verb: string,
  operationId: string,
  answer: Members,
  more: Members = {},
): Members {
  return {
    [verb]: {
      operationId,
      ...more,
      responses: {
        "200": {
          description: "Successful Response",
          content: { "application/json": { schema: answer } },
        },
      },
    },
  };
}

/**
 * Write a reference to a component.
 *
 * @param name - The component's name.
 * @returns The reference schema.
 */
export function ref(name: string): Members {
  return { $ref: `#/components/schemas/${name}` };
}
