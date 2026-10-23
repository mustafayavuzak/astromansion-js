// PATH: src/models/constants/api.ts

/**
 * API CONSTANTS: where the API lives and the names it reads a key under
 *
 * Purpose:
 *   The address a client calls, the headers and the media type it reads by
 *   name, the environment variables a client falls back to, and how a key is
 *   shown wherever it could be printed. The settings, the credentials, the
 *   backoff, and the decoder quote these, so a change here changes all of them.
 *
 * Key mask:
 *   A key is shown as its first VISIBLE_PREFIX_CHARS characters, the
 *   ellipsis, and its last VISIBLE_SUFFIX_CHARS. A key no longer than the two
 *   together is shown as the ellipsis alone, since its two ends would be all
 *   of it:
 *
 *     am_Zx81qP0vT3kL9mN2bC7dE4fG6hJ1sR5w   ──►  am_Zx81q…sR5w
 *     abcdefghijkl (12 characters)          ──►  …
 *     no key                                ──►  none
 */

/**
 * The API's address and the prefix of the paths it publishes.
 *
 * @internal
 */
export const API_ADDRESS = Object.freeze({
  /** The production API root, without a trailing slash. */
  BASE_URL: "https://api.astromansion.com",
  /** The prefix of every published path. A request to any other path is refused. */
  PATH_PREFIX: "/v1/",
} as const);

/**
 * The headers the client reads or sends by name.
 *
 * @internal
 */
export const API_HEADERS = Object.freeze({
  /** The header that carries the API key. */
  KEY: "X-API-Key",
  /** The header a response names its request with, worth quoting in a support request. */
  REQUEST_ID: "X-Request-ID",
  /** The header a refusal asks for a pause with. */
  RETRY_AFTER: "Retry-After",
} as const);

/**
 * The media types the client tells apart.
 *
 * @internal
 */
export const API_MEDIA_TYPES = Object.freeze({
  /** The one text type a client returns as text. Every other document stays bytes. */
  TEXT: "text/plain",
} as const);

/**
 * The environment variables a client reads when its options name no value.
 *
 * @internal
 */
export const API_ENVIRONMENT = Object.freeze({
  /** The API key. */
  KEY: "ASTROMANSION_API_KEY",
  /** The API root, for a staging or a local server. */
  BASE_URL: "ASTROMANSION_BASE_URL",
} as const);

/**
 * How a key is shown wherever it could be printed.
 *
 * @internal
 */
export const KEY_MASK = Object.freeze({
  /** Characters kept from the start of a key. */
  VISIBLE_PREFIX_CHARS: 8,
  /** Characters kept from the end of a key. */
  VISIBLE_SUFFIX_CHARS: 4,
  /** The mark that stands for the hidden middle, or for a whole short key. */
  ELLIPSIS: "…",
  /** What is shown when there is no key. */
  ABSENT: "none",
} as const);
