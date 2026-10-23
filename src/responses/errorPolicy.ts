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
import { HTTP_STATUS } from "../models/constants/http.ts";
import { RETRY_POLICY } from "../models/constants/transport.ts";
import {
  AstroMansionError,
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
 * Decide which error a refused answer becomes, and whether to repeat the request.
 *
 * @remarks
 * The taxonomy and the mapping onto it live in one module, since a class
 * added to the errors without a rule here would never be raised.
 *
 * @example
 * ```ts
 * ErrorPolicy.isQuota(429, "quota_exceeded");   // true
 * ErrorPolicy.isRetryable(503, undefined);      // true
 * ErrorPolicy.forResponse(401, undefined);      // AuthenticationError
 * ```
 */
export const ErrorPolicy = Object.freeze({
  /**
   * Tell whether a refusal means a spent allowance rather than a busy moment.
   *
   * @param status - The HTTP status.
   * @param code - The machine code from the error envelope, when there is one.
   * @returns True for a 429 whose code is one of the API's quota codes, compared without regard to case.
   *
   * @example
   * ```ts
   * ErrorPolicy.isQuota(429, "quota_exceeded");   // true
   * ErrorPolicy.isQuota(429, "rate_limited");     // false
   * ErrorPolicy.isQuota(402, "quota_exceeded");   // false, 402 is a quota without the code
   * ```
   */
  isQuota(status: number, code: string | undefined): boolean {
    if (
      status !== HTTP_STATUS.TOO_MANY_REQUESTS ||
      code === undefined ||
      code === ""
    ) {
      return false;
    }
    const normalized = code.toLowerCase();
    return API_ERROR_CODES.QUOTA.some((quotaCode) => quotaCode === normalized);
  },

  /**
   * Tell whether repeating a refused request could ever help.
   *
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
   * ErrorPolicy.isRetryable(503, undefined);          // true
   * ErrorPolicy.isRetryable(429, "quota_exceeded");   // false
   * ErrorPolicy.isRetryable(422, undefined);          // false
   * ```
   */
  isRetryable(status: number, code: string | undefined): boolean {
    return (
      RETRY_POLICY.RETRYABLE_STATUSES.some(
        (retryable) => retryable === status,
      ) && !ErrorPolicy.isQuota(status, code)
    );
  },

  /**
   * Name the class of failure a refusal becomes, by the rules drawn above.
   *
   * @param status - The HTTP status, 400 or above.
   * @param code - The machine code from the error envelope, when there is one.
   * @returns The class to raise.
   *
   * @example
   * ```ts
   * ErrorPolicy.forResponse(401, undefined);   // AuthenticationError
   * ErrorPolicy.forResponse(429, "quota");     // QuotaExceededError
   * ErrorPolicy.forResponse(502, undefined);   // ServerError
   * ErrorPolicy.forResponse(418, undefined);   // AstroMansionError
   * ```
   */
  forResponse(
    status: number,
    code: string | undefined,
  ): typeof AstroMansionError {
    if (ErrorPolicy.isQuota(status, code)) {
      return QuotaExceededError;
    }
    switch (status) {
      case HTTP_STATUS.UNAUTHORIZED:
        return AuthenticationError;
      case HTTP_STATUS.PAYMENT_REQUIRED:
        return QuotaExceededError;
      case HTTP_STATUS.FORBIDDEN:
        return PermissionDeniedError;
      case HTTP_STATUS.NOT_FOUND:
        return NotFoundError;
      case HTTP_STATUS.CONFLICT:
        return ConflictError;
      case HTTP_STATUS.UNPROCESSABLE_ENTITY:
        return ValidationError;
      case HTTP_STATUS.TOO_MANY_REQUESTS:
        return RateLimitError;
      default:
        return status >= HTTP_STATUS.INTERNAL_SERVER_ERROR
          ? ServerError
          : AstroMansionError;
    }
  },
});
