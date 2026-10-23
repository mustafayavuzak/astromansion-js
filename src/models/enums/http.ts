// PATH: src/models/enums/http.ts

/**
 * HTTP ENUMS: the methods the API answers
 *
 * Purpose:
 *   The verbs request() accepts. The API publishes no other, so a call with
 *   another verb is refused before it is sent.
 */

/** The HTTP methods the API publishes. */
export const HTTP_METHODS = Object.freeze(["GET", "POST", "DELETE"] as const);

/** One HTTP method the API publishes. */
export type HttpMethod = (typeof HTTP_METHODS)[number];
