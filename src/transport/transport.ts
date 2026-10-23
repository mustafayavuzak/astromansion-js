// PATH: src/transport/transport.ts

/**
 * TRANSPORT: sending a request and reading its answer, with retries
 *
 * Purpose:
 *   The one place that calls fetch. It builds the URL from the client's root
 *   and a published path, sends the client's headers, gives every attempt
 *   its own timeout, reads each body once, and repeats what can be repeated:
 *
 *        0 s ─┬─ attempt 1 ──► 503, or no answer
 *             │  wait 0.25 .. 0.5 s, or Retry-After up to 8 s
 *     ~0.5 s ─┼─ attempt 2 ──► 429 rate_limited
 *             │  wait 0.5 .. 1 s, or Retry-After up to 8 s
 *     ~1.5 s ─┴─ attempt 3 ──► the answer, final whatever it is
 *
 *   With the default of two retries the third answer is final, and a
 *   failure that brought no answer becomes AstroMansionConnectionError.
 *
 * Cancellation:
 *   The caller's signal stops the call wherever it is, in an attempt or in a
 *   wait, and the caller gets its own abort reason back, never a retry. The
 *   client's timeout aborts only the attempt it belongs to, which then counts
 *   as a failure that brought no answer.
 *
 * Reading:
 *   A body is read as bytes only when a document is expected, the answer is
 *   a success, and the body is not plain text. Every other body is read as
 *   text, so the common JSON path never needs the platform's binary reader.
 */

import { CLIENT_ERROR_CODES } from "../models/constants/errors.ts";
import {
  AstroMansionConnectionError,
  AstroMansionError,
  ValidationError,
} from "../models/errors/api.ts";
import type { JsonValue } from "../models/records/json.ts";
import type {
  ReceivedResponse,
  ResponseBody,
} from "../models/records/response.ts";
import type {
  OutgoingRequest,
  TransportConfig,
} from "../models/records/transport.ts";
import { HTTP_STATUS } from "../models/constants/http.ts";
import { TRANSPORT_TIMING } from "../models/constants/transport.ts";
import { errorCodeOf, isPlainText } from "../responses/decoder.ts";
import { ErrorPolicy } from "../responses/errorPolicy.ts";
import { backoffDelayMs, retryAfterSeconds } from "./backoff.ts";

/** A call made ready once, before its first attempt, and sent the same by every attempt. */
interface PreparedCall {
  /** The absolute URL, query included. */
  readonly url: string;
  /** The JSON body as text, or null for a call without one. */
  readonly body: string | null;
}

/** The outcome of one attempt, an answer of any status or a failure that brought none. */
type AttemptOutcome =
  | { readonly kind: "answered"; readonly response: ReceivedResponse }
  | {
      readonly kind: "failed";
      readonly error: unknown;
      readonly reason: string;
    };

/**
 * Sends calls to the API and reads their answers, retrying what can be retried.
 *
 * @internal
 * @remarks
 * A client builds one transport and keeps it. The transport holds no state
 * between calls, so concurrent calls share it safely.
 */
export class Transport {
  readonly #config: TransportConfig;

  /**
   * Hold everything the calls are sent with.
   *
   * @param config - The root, the headers, the timeout, the retry count, fetch, the wait, and the random source.
   */
  constructor(config: TransportConfig) {
    this.#config = config;
  }

  /**
   * Send one call, repeating it as the retry policy allows.
   *
   * @param request - The call, its path already checked.
   * @returns The final answer, of any status. The decoder turns a refusal into its error.
   * @throws {@link ValidationError} before the first attempt, when the body cannot be written as JSON.
   * @throws {@link AstroMansionConnectionError} when the root and the path form no URL, or no answer arrived after every retry, with the last failure as its cause.
   * @throws The caller's abort reason, when the caller's signal aborts.
   */
  async send(request: OutgoingRequest): Promise<ReceivedResponse> {
    const { maxRetries, random, wait } = this.#config;
    // A call that cannot be written is the caller's to fix, so it fails here, once, unsent.
    const call: PreparedCall = {
      url: this.#url(request),
      body: serializeBody(request.json),
    };
    for (let attempt = 0; ; attempt += 1) {
      const outcome = await this.#attempt(request, call);
      const isLast = attempt >= maxRetries;
      if (outcome.kind === "failed") {
        if (isLast) {
          throw new AstroMansionConnectionError(
            `could not reach the AstroMansion API: ${outcome.reason}`,
            { cause: outcome.error },
          );
        }
        // A call that never completed cannot have been counted, so repeating it spends nothing twice.
        await wait(backoffDelayMs(attempt, undefined, random), request.signal);
        continue;
      }
      const { response } = outcome;
      if (
        isLast ||
        !ErrorPolicy.isRetryable(response.status, errorCodeOf(response))
      ) {
        return response;
      }
      await wait(
        backoffDelayMs(attempt, retryAfterSeconds(response.headers), random),
        request.signal,
      );
    }
  }

  /**
   * Make one attempt under its own timeout.
   *
   * @param request - The call, for its method, its signal, and how its answer is read.
   * @param call - The URL and the body, made ready once for every attempt.
   * @returns The answer with its body read, or the failure that brought no answer.
   * @throws The caller's abort reason, when the caller's signal aborts before or during the attempt.
   */
  async #attempt(
    request: OutgoingRequest,
    call: PreparedCall,
  ): Promise<AttemptOutcome> {
    const { signal } = request;
    throwIfAborted(signal);
    const { fetch: send, headers, timeoutMs } = this.#config;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, timeoutMs);
    const forwardAbort = (): void => {
      controller.abort();
    };
    signal?.addEventListener("abort", forwardAbort, { once: true });
    try {
      const response = await send(call.url, {
        method: request.method,
        headers,
        body: call.body,
        signal: controller.signal,
      });
      const body = await readBody(response, request.expectDocument);
      return {
        kind: "answered",
        response: { status: response.status, headers: response.headers, body },
      };
    } catch (error: unknown) {
      throwIfAborted(signal);
      // The caller's abort has thrown above, so an aborted attempt here is the timeout's.
      const reason = controller.signal.aborted
        ? `no answer within ${String(timeoutMs / TRANSPORT_TIMING.MS_PER_SECOND)} s`
        : describe(error);
      return { kind: "failed", error, reason };
    } finally {
      clearTimeout(timer);
      signal?.removeEventListener("abort", forwardAbort);
    }
  }

  /**
   * Build the URL of a call from the root, the path, and the query parameters.
   *
   * @param request - The call.
   * @returns The absolute URL, with every defined parameter in its query.
   * @throws {@link AstroMansionConnectionError} when the root and the path do not form a URL, since no request can reach such a root.
   */
  #url(request: OutgoingRequest): string {
    let url: URL;
    try {
      url = new URL(`${this.#config.baseUrl}${request.path}`);
    } catch (error: unknown) {
      throw new AstroMansionConnectionError(
        `could not reach the AstroMansion API: ${this.#config.baseUrl}${request.path} is not a URL`,
        { cause: error },
      );
    }
    for (const [name, value] of Object.entries(request.params ?? {})) {
      if (value !== undefined) {
        url.searchParams.append(name, String(value));
      }
    }
    return url.toString();
  }
}

/**
 * Write a call's JSON body as text.
 *
 * @param json - The body, or undefined for a call without one.
 * @returns The JSON text, or null for a call without a body.
 * @throws {@link ValidationError} when JSON cannot hold the value, such as a BigInt or a cycle.
 */
function serializeBody(json: JsonValue | undefined): string | null {
  if (json === undefined) {
    return null;
  }
  try {
    return JSON.stringify(json);
  } catch (error: unknown) {
    throw new ValidationError(
      `the request body cannot be written as JSON: ${describe(error)}`,
      { errorCode: CLIENT_ERROR_CODES.VALIDATION, cause: error },
    );
  }
}

/**
 * Wait for a duration, the transport's default way of pausing between attempts.
 *
 * @internal
 * @param durationMs - How long to wait, in milliseconds.
 * @param signal - The caller's cancellation, which ends the wait at once.
 * @returns A promise that settles when the time has passed.
 * @throws The signal's abort reason, as a rejection, when the signal aborts first.
 */
export function waitFor(
  durationMs: number,
  signal: AbortSignal | undefined,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal === undefined) {
      setTimeout(resolve, durationMs);
      return;
    }
    if (signal.aborted) {
      reject(abortReason(signal));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortReason(signal));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, durationMs);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Read a body once, as text or as bytes.
 *
 * @param response - The answer, its body unread.
 * @param expectDocument - Whether a success is a document.
 * @returns Bytes for a successful document that is not plain text, and text for everything else.
 */
async function readBody(
  response: Response,
  expectDocument: boolean,
): Promise<ResponseBody> {
  const asText =
    !expectDocument ||
    response.status >= HTTP_STATUS.BAD_REQUEST ||
    isPlainText(response.headers.get("Content-Type"));
  return asText
    ? { kind: "text", text: await response.text() }
    : { kind: "bytes", bytes: new Uint8Array(await response.arrayBuffer()) };
}

/**
 * Stop at once when the caller's signal has aborted.
 *
 * @param signal - The caller's cancellation, if any.
 * @throws The signal's abort reason, when it has aborted.
 */
function throwIfAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) {
    throw abortReason(signal);
  }
}

/**
 * The error an aborted call ends with.
 *
 * @param signal - The aborted signal.
 * @returns The signal's own reason when it is an Error, as fetch would reject with it, and otherwise an AstroMansionError carrying the reason as its cause.
 */
function abortReason(signal: AbortSignal): Error {
  const reason: unknown = signal.reason;
  return reason instanceof Error
    ? reason
    : new AstroMansionError("the call was aborted", {
        errorCode: CLIENT_ERROR_CODES.ABORTED,
        cause: reason,
      });
}

/**
 * Describe a failure that brought no answer.
 *
 * @param error - What fetch or the body reader threw.
 * @returns Its message, or its text when it is not an Error.
 */
function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
