// PATH: src/responses/decoder.ts

/**
 * DECODER: what an answer means for the caller
 *
 * Purpose:
 *   Every answer passes through here, so a status means the same for every
 *   endpoint and every generated method:
 *
 *     status 400 and above          ──► the error class the policy names
 *     JSON body                     ──► the JSON, its wrapper opened
 *     text/plain body               ──► text, as the server rendered it
 *     any other body (PNG, PDF, …)  ──► the document's bytes
 *
 *   A refusal whose body is not the documented error envelope still yields
 *   what it can, the status alone, so a caller handling errors never meets a
 *   second, different failure from the client itself.
 *
 * Text and bytes:
 *   Only text/plain becomes text. A CSV export or an SVG wheel is a document
 *   a caller writes to a file, and it stays bytes.
 */

import { API_HEADERS } from "../models/constants/api.ts";
import { ERROR_ENVELOPE_KEYS } from "../models/constants/envelope.ts";
import type { AstroMansionError } from "../models/errors/api.ts";
import type { JsonValue } from "../models/records/json.ts";
import type { ReceivedResponse } from "../models/records/response.ts";
import { retryAfterSeconds } from "../transport/backoff.ts";
import { openEnvelope } from "./envelope.ts";
import { errorClassFor } from "./errorPolicy.ts";
import { isJsonObject, parseJsonBody } from "./json.ts";

/**
 * How one answer is read.
 *
 * @internal
 */
export interface DecodeOptions {
  /** Whether a success is a document rather than JSON. A refusal is read as JSON either way. */
  readonly expectDocument: boolean;
  /** What the endpoint publishes about its wrapper, or undefined to let the body decide. */
  readonly enveloped: boolean | undefined;
}

/** The parts of an error envelope, each undefined when the body names none. */
interface ErrorParts {
  readonly code: string | undefined;
  readonly message: string | undefined;
  readonly detail: JsonValue | undefined;
}

/**
 * Turn an answer into what the caller receives, or into the error it is.
 *
 * @internal
 * @param received - The answer, its body read once.
 * @param options - How the answer is read.
 * @returns The JSON value, its wrapper opened, or text for text/plain, or bytes for any other document.
 * @throws {@link AstroMansionError} or the subclass the error policy names, for a status of 400 or above.
 *
 * @example
 * ```ts
 * const asJson = { expectDocument: false, enveloped: undefined };
 * const headers = new Headers({ "X-Request-ID": "66c0af19" });
 *
 * const wrapped = '{"technique":"natal","result":{"sun":"Leo"}}';
 * decodeResponse({ status: 200, headers, body: { kind: "text", text: wrapped } }, asJson);
 * // { sun: "Leo" }
 *
 * const table = new Headers({ "Content-Type": "text/plain" });
 * decodeResponse({ status: 200, headers: table, body: { kind: "text", text: "Saturn Taurus" } }, asJson);
 * // "Saturn Taurus"
 *
 * const missing = '{"error":{"code":"not_found","message":"no such body"}}';
 * decodeResponse({ status: 404, headers, body: { kind: "text", text: missing } }, asJson);
 * // throws NotFoundError, message "no such body | request_id=66c0af19"
 * ```
 */
export function decodeResponse(
  received: ReceivedResponse,
  options: DecodeOptions,
): JsonValue | string | Uint8Array {
  const { status, headers, body } = received;
  const payload =
    body.kind === "text" && (!options.expectDocument || status >= 400)
      ? parseJsonBody(body.text)
      : undefined;
  if (status >= 400) {
    throw refusal(received, payload);
  }
  if (payload !== undefined) {
    return openEnvelope(payload, options.enveloped);
  }
  if (body.kind === "bytes") {
    return body.bytes;
  }
  // A rendered table is meant to be printed, while bytes would print as numbers.
  return isPlainText(headers.get("Content-Type"))
    ? body.text
    : new TextEncoder().encode(body.text);
}

/**
 * Read the machine code a refusal carries, before the caller sees it.
 *
 * @internal
 * @remarks
 * The retry decision needs the code to tell a spent quota from a rate limit,
 * and it has to look before the answer is decoded for the caller.
 *
 * @param received - The answer, its body read once.
 * @returns The error envelope's code, or undefined when the body names none or is not JSON.
 *
 * @example
 * ```ts
 * const quota = '{"error":{"code":"quota_exceeded","message":"monthly allowance spent"}}';
 * errorCodeOf({ status: 429, headers: new Headers(), body: { kind: "text", text: quota } });
 * // "quota_exceeded"
 * errorCodeOf({ status: 503, headers: new Headers(), body: { kind: "text", text: "Service Unavailable" } });
 * // undefined, a body that is not JSON names no code
 * ```
 */
export function errorCodeOf(received: ReceivedResponse): string | undefined {
  return received.body.kind === "text"
    ? errorParts(parseJsonBody(received.body.text)).code
    : undefined;
}

/**
 * Tell whether a Content-Type names plain text.
 *
 * @internal
 * @param contentType - The header's text, or null when the response carried none.
 * @returns True for text/plain with any parameters, such as a charset.
 *
 * @example
 * ```ts
 * isPlainText("text/plain; charset=utf-8");   // true
 * isPlainText("text/csv");                    // false
 * isPlainText(null);                          // false
 * ```
 */
export function isPlainText(contentType: string | null): boolean {
  if (contentType === null) {
    return false;
  }
  const mediaType = contentType.split(";")[0]?.trim().toLowerCase();
  return mediaType === "text/plain";
}

/**
 * Build the error a refused answer becomes.
 *
 * @param received - The refused answer.
 * @param payload - Its body as JSON, or undefined when it was not JSON.
 * @returns The error of the class the policy names, carrying everything the answer said.
 */
function refusal(
  received: ReceivedResponse,
  payload: JsonValue | undefined,
): AstroMansionError {
  const { status, headers } = received;
  const parts = errorParts(payload);
  const ErrorClass = errorClassFor(status, parts.code);
  const summary =
    parts.message === undefined || parts.message === ""
      ? `AstroMansion API returned HTTP ${String(status)}`
      : parts.message;
  return new ErrorClass(summary, {
    statusCode: status,
    errorCode: parts.code,
    details: parts.detail,
    requestId: headers.get(API_HEADERS.REQUEST_ID) ?? undefined,
    retryAfterSeconds: retryAfterSeconds(headers),
  });
}

/**
 * Pull the code, the message, and the detail out of an error body.
 *
 * @param payload - The body as JSON, or undefined when it was not JSON.
 * @returns The envelope's parts, or a bare detail, or nothing, whatever the body holds.
 *
 * @example
 * ```ts
 * errorParts({ error: { code: "quota", message: "spent" } });   // { code: "quota", message: "spent", detail: undefined }
 * errorParts({ detail: "bad field" });                          // { code: undefined, message: undefined, detail: "bad field" }
 * errorParts(undefined);                                        // every part undefined
 * ```
 */
function errorParts(payload: JsonValue | undefined): ErrorParts {
  if (!isJsonObject(payload)) {
    return { code: undefined, message: undefined, detail: undefined };
  }
  const error = payload[ERROR_ENVELOPE_KEYS.ERROR];
  if (isJsonObject(error)) {
    return {
      code: textOrUndefined(error[ERROR_ENVELOPE_KEYS.CODE]),
      message: textOrUndefined(error[ERROR_ENVELOPE_KEYS.MESSAGE]),
      detail: error[ERROR_ENVELOPE_KEYS.DETAIL],
    };
  }
  return {
    code: undefined,
    message: undefined,
    detail: payload[ERROR_ENVELOPE_KEYS.DETAIL],
  };
}

/**
 * Keep a JSON value only when it is text.
 *
 * @param value - A member of the error envelope.
 * @returns The text, or undefined for any other value or for an absent member.
 */
function textOrUndefined(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}
