// PATH: src/models/constants/envelope.ts

/**
 * ENVELOPE CONSTANTS: the member names of the API's two body wrappers
 *
 * Purpose:
 *   A successful answer is either the data itself or a wrapper around it,
 *   and a failure is always the error envelope:
 *
 *     {"technique": "transits", "result": {...}}
 *     {"error": {"code": "validation", "message": "...", "detail": "..."}}
 *
 *   The decoder and the envelope reader quote these names. They are the
 *   API's wire names and change only with the API.
 */

/**
 * The members of the success wrapper, which holds these two and nothing else.
 *
 * @internal
 */
export const SUCCESS_ENVELOPE_KEYS = Object.freeze({
  /** The name of the technique that answered, as text. */
  TECHNIQUE: "technique",
  /** The data the technique produced. */
  RESULT: "result",
} as const);

/**
 * The members of the error envelope, and of the bare validation body FastAPI answers with.
 *
 * @internal
 */
export const ERROR_ENVELOPE_KEYS = Object.freeze({
  /** The member that holds the error object. */
  ERROR: "error",
  /** The stable machine code of the failure. */
  CODE: "code",
  /** The human-readable summary. */
  MESSAGE: "message",
  /** The field-level explanation, a text or a list of problems. A bare validation body holds only this. */
  DETAIL: "detail",
} as const);
