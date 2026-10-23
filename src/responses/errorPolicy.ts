// PATH: src/responses/errorPolicy.ts

/**
 * ERROR POLICY: which error a refusal becomes, and whether repeating it helps
 *
 * Purpose:
 *   A refusal is decided by its status and by the code in its error
 *   envelope, in this order, and the first rule that matches wins:
 *
 *      1. 429 with a quota code  ──► QuotaExceededError     never retried
 *      2. 401                    ──► AuthenticationError
 *      3. 402                    ──► QuotaExceededError
 *      4. 403                    ──► PermissionDeniedError
 *      5. 404                    ──► NotFoundError
 *      6. 409                    ──► ConflictError
 *      7. 422                    ──► ValidationError
 *      8. 429                    ──► RateLimitError         retried
 *      9. 500 and above          ──► ServerError            retried for 500, 502, 503, 504
 *     10. anything else          ──► AstroMansionError
 *
 *   A spent quota and a busy moment share 429 but need opposite answers from
 *   the caller, so the code decides between them. The classes and this
 *   mapping change together, since a class without a rule here is never
 *   raised.
 */

import { API_ERROR_CODES } from "../models/constants/errors.ts";
import { RETRY_POLICY } from "../models/constants/transport.ts";
import {
  AstroMansionError,
  type AstroMansionErrorInit,
  AuthenticationError,
  ConflictError,
  NotFoundError,
  PermissionDeniedError,
  QuotaExceededError,
  RateLimitError,
  ServerError,
  ValidationError,
} from "../models/errors/api.ts";

/**
 * A class of failure, built from a summary and what the failure carries.
 *
 * @internal
 */
export type AstroMansionErrorClass = new (
  summary: string,
  init?: AstroMansionErrorInit,
) => AstroMansionError;

/**
 * Tell whether a refusal means a spent allowance rather than a busy moment.
 *
 * @internal
 * @param status - The HTTP status.
 * @param code - The machine code from the error envelope, when there is one.
 * @returns True for a 429 whose code is one of the API's quota codes, compared without regard to case.
 *
 * @example
 * ```ts
 * isQuota(429, "quota_exceeded");   // true
 * isQuota(429, "rate_limited");     // false
 * isQuota(402, "quota_exceeded");   // false, 402 is a quota without the code
 * ```
 */
export function isQuota(status: number, code: string | undefined): boolean {
  if (status !== 429 || code === undefined) {
    return false;
  }
  const normalized = code.toLowerCase();
  return API_ERROR_CODES.QUOTA.some((quotaCode) => quotaCode === normalized);
}

/**
 * Tell whether repeating a refused request could ever help.
 *
 * @internal
 * @remarks
 * A spent quota is not a busy moment. It answers 429 like a rate limit, and
 * only a new period or a larger plan clears it, so asking again spends more
 * round trips to be told the same thing.
 *
 * @param status - The HTTP status.
 * @param code - The machine code from the error envelope, when there is one.
 * @returns True when another attempt is worth making.
 *
 * @example
 * ```ts
 * isRetryable(503, undefined);          // true
 * isRetryable(429, "quota_exceeded");   // false
 * isRetryable(422, undefined);          // false
 * ```
 */
export function isRetryable(status: number, code: string | undefined): boolean {
  return (
    RETRY_POLICY.RETRYABLE_STATUSES.some((retryable) => retryable === status) &&
    !isQuota(status, code)
  );
}

/**
 * Name the class of failure a refusal becomes, by the rules drawn above.
 *
 * @internal
 * @param status - The HTTP status, 400 or above.
 * @param code - The machine code from the error envelope, when there is one.
 * @returns The class to raise.
 *
 * @example
 * ```ts
 * errorClassFor(401, undefined);   // AuthenticationError
 * errorClassFor(429, "quota");     // QuotaExceededError
 * errorClassFor(502, undefined);   // ServerError
 * errorClassFor(418, undefined);   // AstroMansionError
 * ```
 */
export function errorClassFor(
  status: number,
  code: string | undefined,
): AstroMansionErrorClass {
  if (isQuota(status, code)) {
    return QuotaExceededError;
  }
  switch (status) {
    case 401:
      return AuthenticationError;
    case 402:
      return QuotaExceededError;
    case 403:
      return PermissionDeniedError;
    case 404:
      return NotFoundError;
    case 409:
      return ConflictError;
    case 422:
      return ValidationError;
    case 429:
      return RateLimitError;
    default:
      return status >= 500 ? ServerError : AstroMansionError;
  }
}
