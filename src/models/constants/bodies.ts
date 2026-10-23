// PATH: src/models/constants/bodies.ts

/**
 * BODY CONSTANTS: the wire names of request bodies, and the share card's fixed values
 *
 * Purpose:
 *   One-person endpoints take birth and options. Two-person endpoints add
 *   partner, which is what the API calls the second chart. The share card is
 *   the one endpoint written by hand. It is sent to its own path, draws a
 *   synastry card unless asked for a natal one, and takes names and lang
 *   beside the charts.
 */

/**
 * The top-level fields of a request body.
 *
 * @internal
 */
export const REQUEST_BODY = Object.freeze({
  BIRTH: "birth",
  PARTNER: "partner",
  OPTIONS: "options",
} as const);

/**
 * The arguments a method takes beside the body's own fields, which never reach the body.
 *
 * @internal
 */
export const CALL_KEYWORDS = Object.freeze({
  /** The path a document is written to. */
  OUTPUT: "output",
  /** The caller's cancellation. */
  SIGNAL: "signal",
} as const);

/**
 * The share card's path, its technique, and the fields only it takes.
 *
 * @internal
 */
export const SHARECARD = Object.freeze({
  PATH: "/v1/render/sharecard",
  TECHNIQUE: "render_sharecard",
  /** The card drawn when the caller names no type. */
  SYNASTRY: "synastry",
  TYPE: "type",
  NAMES: "names",
  LANG: "lang",
} as const);
