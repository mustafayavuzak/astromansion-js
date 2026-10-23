// PATH: src/models/enums/endpoints.ts

/**
 * ENDPOINT KINDS: the request shapes an endpoint can have
 *
 * Purpose:
 *   The generator sorts every published operation into one shape, and the
 *   shape decides how its method takes its arguments:
 *
 *     chart         the birth and options, birth fields taken flat
 *     pair          two charts, birth and partner, taken as two arguments
 *     birth_extra   a body holding a birth beside other fields, sent as given
 *     body          a body without a birth, sent as given
 *     get           a GET with query parameters
 *     delete        a DELETE with query parameters
 *     empty         a POST without a body
 *
 *   The names are the Python SDK's, so the two endpoint tables compare.
 */

/**
 * Every request shape an endpoint can have.
 *
 * @internal
 */
export const ENDPOINT_KINDS = Object.freeze([
  "chart",
  "pair",
  "birth_extra",
  "body",
  "get",
  "delete",
  "empty",
] as const);

/**
 * One request shape.
 *
 * @internal
 */
export type EndpointKind = (typeof ENDPOINT_KINDS)[number];
