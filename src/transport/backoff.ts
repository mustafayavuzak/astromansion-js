// PATH: src/transport/backoff.ts

/**
 * BACKOFF: how long to wait before repeating a request
 *
 * Purpose:
 *   The server's Retry-After wins when it sent one, since the server knows
 *   when its window reopens, up to a ceiling so a call never stalls for
 *   minutes. Otherwise the wait grows exponentially and keeps a random share
 *   of its window, so clients that failed together do not retry together:
 *
 *     attempt   window (ms)       wait (ms)
 *     0           500             250 .. 500
 *     1         1 000             500 .. 1 000
 *     2         2 000           1 000 .. 2 000
 *     5         8 000 ceiling   4 000 .. 8 000
 *
 *   Retry-After is read in seconds, the only form the API sends. The HTTP
 *   date form is ignored, and the exponential wait covers it.
 */

import { API_HEADERS } from "../models/constants/api.ts";
import {
  RETRY_AFTER,
  TRANSPORT_TIMING,
} from "../models/constants/transport.ts";

/**
 * Read a Retry-After value given in seconds.
 *
 * @internal
 * @param value - The header's text, or null when the response carried none.
 * @returns Seconds to wait, never negative, or undefined when the value is absent or not a number of seconds.
 *
 * @example
 * ```ts
 * parseRetryAfterSeconds("3");                               // 3
 * parseRetryAfterSeconds("-1");                              // 0
 * parseRetryAfterSeconds("Wed, 21 Oct 2026 07:28:00 GMT");   // undefined
 * ```
 */
export function parseRetryAfterSeconds(
  value: string | null,
): number | undefined {
  if (value === null) {
    return undefined;
  }
  const text = value.trim();
  if (!RETRY_AFTER.SECONDS_PATTERN.test(text)) {
    return undefined;
  }
  return Math.max(0, Number(text));
}

/**
 * Read the pause a response asked for.
 *
 * @internal
 * @param headers - The response headers.
 * @returns Seconds to wait, or undefined when the response asked for none.
 */
export function retryAfterSeconds(headers: Headers): number | undefined {
  return parseRetryAfterSeconds(headers.get(API_HEADERS.RETRY_AFTER));
}

/**
 * Compute the pause before the next attempt.
 *
 * @internal
 * @param attempt - The zero-based number of the attempt that just failed.
 * @param serverPauseSeconds - The pause the server asked for, in seconds, or undefined.
 * @param random - A source of numbers in [0, 1).
 * @returns The server's pause capped at the ceiling, or this attempt's window reduced by a random share of at most half, in milliseconds.
 *
 * @example
 * ```ts
 * backoffDelayMs(0, 3, Math.random);           // 3000
 * backoffDelayMs(0, 60, Math.random);          // 8000, the ceiling
 * backoffDelayMs(1, undefined, () => 0);       // 500, half of the 1000 ms window
 * ```
 */
export function backoffDelayMs(
  attempt: number,
  serverPauseSeconds: number | undefined,
  random: () => number,
): number {
  if (serverPauseSeconds !== undefined) {
    return Math.min(
      serverPauseSeconds * TRANSPORT_TIMING.MS_PER_SECOND,
      TRANSPORT_TIMING.BACKOFF_CEILING_MS,
    );
  }
  const window = Math.min(
    TRANSPORT_TIMING.BACKOFF_BASE_MS * 2 ** attempt,
    TRANSPORT_TIMING.BACKOFF_CEILING_MS,
  );
  const floor = TRANSPORT_TIMING.JITTER_FLOOR_FRACTION;
  return window * (floor + random() * (1 - floor));
}
