// PATH: src/models/constants/http.ts

/**
 * HTTP CONSTANTS: the statuses the client tells apart
 *
 * Purpose:
 *   The statuses the error policy, the decoder, and the retry rule name, as
 *   Python's http.HTTPStatus names them for the Python SDK. A status not
 *   named here is read only through the ranges these set.
 */

/**
 * The HTTP statuses the client tells apart.
 *
 * @internal
 */
export const HTTP_STATUS = Object.freeze({
  /** The first status of a refusal. Every status from here up is an error. */
  BAD_REQUEST: 400,
  /** The key is missing or not recognised. */
  UNAUTHORIZED: 401,
  /** The plan's allowance is spent. */
  PAYMENT_REQUIRED: 402,
  /** The plan does not include the feature. */
  FORBIDDEN: 403,
  /** No such endpoint or resource. */
  NOT_FOUND: 404,
  /** The request contradicts the current state. */
  CONFLICT: 409,
  /** The request's fields failed validation. */
  UNPROCESSABLE_ENTITY: 422,
  /** Too many requests, or a spent quota when the code says so. */
  TOO_MANY_REQUESTS: 429,
  /** The first status of a server failure. Every status from here up is one. */
  INTERNAL_SERVER_ERROR: 500,
  /** A proxy in front of the API got no usable answer. */
  BAD_GATEWAY: 502,
  /** The API cannot answer for now. */
  SERVICE_UNAVAILABLE: 503,
  /** A proxy in front of the API waited too long for it. */
  GATEWAY_TIMEOUT: 504,
} as const);
