// PATH: src/models/constants/transport.ts

/**
 * TRANSPORT CONSTANTS: how long a request may take, and when it is repeated
 *
 * Purpose:
 *   The timeout of one attempt, which failures are repeated, and how long the
 *   client waits before repeating one. The transport and the backoff quote
 *   these, and the client's options default to them.
 *
 * Timeout:
 *   fetch cannot time the connection apart from the answer, so one timeout
 *   covers a whole attempt, from sending the request to the last byte read.
 *
 * Retry:
 *   Only a failure that carries no result is repeated. A request that never
 *   completed cannot have been counted against the caller's allowance, and a
 *   status in RETRYABLE_STATUSES means the server produced nothing, so
 *   neither can be charged twice. A refusal the caller must fix is never
 *   repeated, and neither is a spent quota.
 */

/**
 * How long a client waits, in milliseconds unless a member says otherwise.
 *
 * @internal
 */
export const TRANSPORT_TIMING = Object.freeze({
  /** The longest one attempt may take, from sending the request to the last byte of the answer. */
  ATTEMPT_TIMEOUT_MS: 30_000,
  /** The first backoff window. It doubles with every failed attempt. */
  BACKOFF_BASE_MS: 500,
  /** The longest wait before a retry, whatever Retry-After asks for. */
  BACKOFF_CEILING_MS: 8_000,
  /** The smallest share of its window a jittered wait keeps, as a fraction between 0 and 1. */
  JITTER_FLOOR_FRACTION: 0.5,
  /** Milliseconds in one second, to read Retry-After, which counts in seconds. */
  MS_PER_SECOND: 1_000,
} as const);

/**
 * Which failures are repeated, and how often.
 *
 * @internal
 */
export const RETRY_POLICY = Object.freeze({
  /** Repeats allowed after the first attempt, unless the client's options say otherwise. */
  MAX_RETRIES: 2,
  /** The statuses that mean the server produced nothing and may answer the same request later. */
  RETRYABLE_STATUSES: Object.freeze([429, 500, 502, 503, 504] as const),
} as const);

/**
 * How the Retry-After header is read.
 *
 * @internal
 */
export const RETRY_AFTER = Object.freeze({
  /**
   * A wait in seconds, a whole or a decimal number, which may be negative.
   * The HTTP date form does not match and is ignored.
   *
   * ```text
   * ^ -? \d+ (?: \. \d+ )? $
   *   │  │       └─ optional fraction
   *   │  └─ whole seconds
   *   └─ optional sign, read as no wait at all
   * ```
   *
   * Accepts `3`, `0`, `1.5`, `-1`.
   * Refuses `0x10`, `1e3`, `.5`, `Wed, 21 Oct 2026 07:28:00 GMT`, and empty text.
   */
  SECONDS_PATTERN: /^-?\d+(?:\.\d+)?$/,
} as const);
