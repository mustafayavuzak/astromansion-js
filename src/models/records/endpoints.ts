// PATH: src/models/records/endpoints.ts

/**
 * ENDPOINT RECORDS: one operation the API publishes
 *
 * Purpose:
 *   The generator writes one record per operation into the endpoint table,
 *   and the tests read them to check that the client and the module-level
 *   shortcuts cover the API, under the same names as the Python SDK's.
 */

import type { EndpointKind } from "../enums/endpoints.ts";

/**
 * One published operation, from the generated table to the code that reads it.
 *
 * @internal
 */
export interface Endpoint {
  /** The method's name on the client, such as renderPng. */
  readonly name: string;
  /** The API's operation id, which is the Python SDK's method name, such as render_png. */
  readonly operationId: string;
  /** The HTTP method. */
  readonly method: string;
  /** The path template, possibly holding one placeholder. */
  readonly path: string;
  /** The request shape. */
  readonly kind: EndpointKind;
  /** The body's top-level fields, or the query's and the path's parameters. */
  readonly fields: readonly string[];
  /** Whether a success is a document rather than JSON. */
  readonly binary: boolean;
  /** Whether a success is wrapped in `{technique, result}`, or undefined when the schema is free-form and the body decides. */
  readonly enveloped: boolean | undefined;
  /** One line describing the endpoint, taken from the schema. */
  readonly summary: string;
}
