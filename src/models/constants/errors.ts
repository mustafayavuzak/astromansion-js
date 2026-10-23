// PATH: src/models/constants/errors.ts

/**
 * ERROR CONSTANTS: the machine codes a failure carries
 *
 * Purpose:
 *   The API's codes that mean a spent allowance, and the codes of the
 *   failures the client detects on its own, in the vocabulary the API uses.
 *   A rate limit and a spent quota both answer 429, and only the code tells
 *   them apart. Waiting clears a rate limit and never clears a spent quota.
 */

/**
 * The codes the API sends with a refusal, as far as the client decides on them.
 *
 * @internal
 */
export const API_ERROR_CODES = Object.freeze({
  /** The codes that mean the plan's allowance for the period is spent, compared without regard to case. */
  QUOTA: Object.freeze([
    "quota_exceeded",
    "quota",
    "monthly_quota_exceeded",
  ] as const),
} as const);

/**
 * The codes of the failures the client finds without the API saying so.
 *
 * @internal
 */
export const CLIENT_ERROR_CODES = Object.freeze({
  /** No key was found and the call needs one. */
  MISSING_API_KEY: "missing_api_key",
  /** The call was refused before it was sent, such as for a malformed path or option. */
  VALIDATION: "validation",
  /** A key would ship inside a browser page or a React Native app. */
  CLIENT_SIDE_KEY: "client_side_key",
  /** The caller's signal cancelled the call with a reason that is not an Error. */
  ABORTED: "aborted",
  /** An answer did not have the shape the API publishes for it. */
  UNEXPECTED_ANSWER: "unexpected_answer",
  /** A catalog walk's answers would never end it, or ended it too late to be whole. */
  PAGINATION: "pagination",
} as const);
