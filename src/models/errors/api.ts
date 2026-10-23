// PATH: src/models/errors/api.ts

/**
 * API ERRORS: every failure the client reports, one class per cause
 *
 * Purpose:
 *   Each failure becomes the class that names its cause, so a caller catches
 *   the case it can act on instead of matching text. AstroMansionError is the
 *   one base:
 *
 *     AstroMansionError
 *     ├── AstroMansionConnectionError   no answer arrived
 *     ├── AuthenticationError           401, or no key where one is needed
 *     ├── QuotaExceededError            402, or 429 with a quota code
 *     ├── PermissionDeniedError         403
 *     ├── NotFoundError                 404
 *     ├── ConflictError                 409
 *     ├── ValidationError               422, or refused before sending
 *     ├── RateLimitError                429 without a quota code
 *     └── ServerError                   500 and above
 *
 *   Which status becomes which class is decided in one place, the error
 *   policy of the responses.
 *
 * Message:
 *   The message joins the summary, the field-level details, and the request
 *   id, so a logged error carries everything a support request needs:
 *
 *     lat must be within -90..90 | {"field":"lat"} | request_id=66c0af19
 */

import type { JsonValue } from "../records/json.ts";

/** How a message is put together from its parts. */
const API_ERRORS_CONFIG = Object.freeze({
  /** The text between two parts of a message. */
  MESSAGE_SEPARATOR: " | ",
  /** The label in front of the request id. */
  REQUEST_ID_LABEL: "request_id=",
} as const);

/** What a failure carries besides its summary. Every member may be absent. */
export interface AstroMansionErrorInit {
  /** The HTTP status, absent when no answer arrived. */
  readonly statusCode?: number | undefined;
  /** The stable machine code from the error envelope, or one of the client's own codes. */
  readonly errorCode?: string | undefined;
  /** The field-level explanation, a text or a list of problems, when the API sent one. */
  readonly details?: JsonValue | undefined;
  /** The server's id for the request, worth quoting in a support request. */
  readonly requestId?: string | undefined;
  /** How long the server asked the caller to wait before trying again, in seconds. */
  readonly retryAfter?: number | undefined;
  /** The failure underneath, such as the network error of a request that never arrived. */
  readonly cause?: unknown;
}

/**
 * The base of every failure the API or the transport reports.
 *
 * @remarks
 * Catch it to handle every failure of a call at once, or one of its
 * subclasses to handle one cause. The fields follow the error envelope the
 * API answers with, and each is undefined when the failure carries none.
 * The class is open for extension only by the subclasses in this module.
 *
 * @example
 * ```ts
 * try {
 *   await client.request("POST", "/v1/natal", { json: { birth } });
 * } catch (error) {
 *   if (error instanceof RateLimitError) {
 *     // wait error.retryAfter, then try again
 *   } else if (error instanceof AstroMansionError) {
 *     console.error(error.statusCode, error.errorCode, error.message);
 *     // 422 "validation" "lat must be within -90..90 | request_id=66c0af19"
 *   }
 * }
 * ```
 */
export class AstroMansionError extends Error {
  /** The class's name, which a stack trace and String(error) start with. */
  override readonly name: string = "AstroMansionError";
  /** The HTTP status, or undefined when no answer arrived. */
  readonly statusCode: number | undefined;
  /** The stable machine code from the error envelope, or one of the client's own codes. */
  readonly errorCode: string | undefined;
  /** The field-level explanation, when the API supplied one. */
  readonly details: JsonValue | undefined;
  /** The server's id for the request, worth quoting in a support request. */
  readonly requestId: string | undefined;
  /** How long the server asked the caller to wait before trying again, in seconds. */
  readonly retryAfter: number | undefined;

  /**
   * Record what failed and what the server said about it.
   *
   * @param summary - What failed, in one sentence. The message adds the details and the request id to it.
   * @param init - What the failure carries besides the summary.
   */
  constructor(summary: string, init: AstroMansionErrorInit = {}) {
    super(
      composeMessage(summary, init.details, init.requestId),
      init.cause === undefined ? undefined : { cause: init.cause },
    );
    this.statusCode = init.statusCode;
    this.errorCode = init.errorCode;
    this.details = init.details;
    this.requestId = init.requestId;
    this.retryAfter = init.retryAfter;
  }
}

/**
 * The request never reached the API, or no answer came back, after every retry.
 *
 * @remarks
 * Named with the package's prefix, so it is never confused with a runtime's
 * own connection error. Its cause is the last failure the transport saw.
 */
export class AstroMansionConnectionError extends AstroMansionError {
  /** {@inheritDoc AstroMansionError.name} */
  override readonly name: string = "AstroMansionConnectionError";
}

/** The API key is missing, malformed, or not recognised (401). */
export class AuthenticationError extends AstroMansionError {
  /** {@inheritDoc AstroMansionError.name} */
  override readonly name: string = "AuthenticationError";
}

/**
 * The plan's allowance for the period is spent.
 *
 * @remarks
 * Raised for 402, and for a 429 whose code names a quota rather than a rate.
 * Waiting does not clear it. A new period or a larger plan does.
 */
export class QuotaExceededError extends AstroMansionError {
  /** {@inheritDoc AstroMansionError.name} */
  override readonly name: string = "QuotaExceededError";
}

/** The key is valid, but the plan does not include this feature (403). */
export class PermissionDeniedError extends AstroMansionError {
  /** {@inheritDoc AstroMansionError.name} */
  override readonly name: string = "PermissionDeniedError";
}

/** No such endpoint or resource (404). */
export class NotFoundError extends AstroMansionError {
  /** {@inheritDoc AstroMansionError.name} */
  override readonly name: string = "NotFoundError";
}

/** The request contradicts the current state, such as a name already taken (409). */
export class ConflictError extends AstroMansionError {
  /** {@inheritDoc AstroMansionError.name} */
  override readonly name: string = "ConflictError";
}

/**
 * The API rejected the request (422), or the client refused it before sending.
 *
 * @remarks
 * `details` names the field when the API supplies one.
 */
export class ValidationError extends AstroMansionError {
  /** {@inheritDoc AstroMansionError.name} */
  override readonly name: string = "ValidationError";
}

/**
 * Too many requests inside the rate window (429).
 *
 * @remarks
 * It clears on its own after `retryAfter`, unlike a spent quota. The
 * client has already retried it before raising it.
 */
export class RateLimitError extends AstroMansionError {
  /** {@inheritDoc AstroMansionError.name} */
  override readonly name: string = "RateLimitError";
}

/** The API failed to answer (500 and above), after the retries the status allows. */
export class ServerError extends AstroMansionError {
  /** {@inheritDoc AstroMansionError.name} */
  override readonly name: string = "ServerError";
}

/**
 * Join the summary with the details and the request id that are present.
 *
 * @param summary - What failed.
 * @param details - The field-level explanation, as text or as JSON.
 * @param requestId - The server's id for the request.
 * @returns The parts that carry something, joined by the separator.
 */
function composeMessage(
  summary: string,
  details: JsonValue | undefined,
  requestId: string | undefined,
): string {
  const parts = [summary];
  if (details !== undefined && carriesContent(details)) {
    parts.push(typeof details === "string" ? details : JSON.stringify(details));
  }
  if (requestId !== undefined && requestId !== "") {
    parts.push(`${API_ERRORS_CONFIG.REQUEST_ID_LABEL}${requestId}`);
  }
  return parts.join(API_ERRORS_CONFIG.MESSAGE_SEPARATOR);
}

/**
 * Tell whether a detail says anything, as the API's own clients read one.
 *
 * @param details - The field-level explanation.
 * @returns False for null, false, zero, empty text, an empty list, and an empty object.
 */
function carriesContent(details: JsonValue): boolean {
  if (
    details === null ||
    details === false ||
    details === 0 ||
    details === ""
  ) {
    return false;
  }
  if (Array.isArray(details)) {
    return details.length > 0;
  }
  return typeof details !== "object" || Object.keys(details).length > 0;
}
