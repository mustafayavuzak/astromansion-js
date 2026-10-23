// PATH: src/client.ts

/**
 * CLIENT: the AstroMansion class, the one object a caller builds
 *
 * Purpose:
 *   A client holds a key, an API root, and a transport, and reaches the API
 *   through them. It has a named method for each published operation, from
 *   EndpointMethods, and request() reaches any published path:
 *
 *     client.natal(...)            the generated method, typed by the API's schema
 *        │
 *        ▼
 *     client.request(...)
 *        │  method, path, body, and key checked before the network
 *        ▼
 *     Transport.send ──► fetch      retries 429 and 5xx without a quota code
 *        │
 *        ▼
 *     decodeResponse ──► JSON, text, or bytes, or the error the status names
 *
 * Usage:
 *   const client = new AstroMansion();   // reads ASTROMANSION_API_KEY
 *   const chart = await client.natal({
 *     birth: { date: "2000-01-01", time: "12:00", lat: 51.4779, lon: 0, timezone: "Europe/London" },
 *   });
 *
 * Key:
 *   The key lives in a private field. String(client) shows it masked, and
 *   neither JSON.stringify nor Node.js's inspection reaches it.
 */

import {
  buildHeaders,
  checkPath,
  guardClientSideKey,
  maskApiKey,
  requireApiKey,
  resolveApiKey,
  resolveBaseUrl,
} from "./credentials.ts";
import { EndpointMethods } from "./endpointMethods.ts";
import { CLIENT_ERROR_CODES } from "./models/constants/errors.ts";
import {
  RETRY_POLICY,
  TRANSPORT_TIMING,
} from "./models/constants/transport.ts";
import { HTTP_METHODS, type HttpMethod } from "./models/enums/http.ts";
import { ValidationError } from "./models/errors/api.ts";
import type { ClientOptions, RequestOptions } from "./models/records/client.ts";
import type { JsonValue } from "./models/records/json.ts";
import { decodeResponse } from "./responses/decoder.ts";
import { Settings } from "./settings.ts";
import { Transport, waitFor } from "./transport/transport.ts";

/**
 * Talks to the AstroMansion API.
 *
 * @remarks
 * Build one client per key and keep it, since it holds the key, the root, and
 * the retry policy. Every method returns a promise. The key is read from the
 * apiKey option, then from ASTROMANSION_API_KEY, which keeps it out of
 * source files. The named methods come from {@link EndpointMethods}. The
 * class is closed to extension.
 *
 * @example
 * ```ts
 * import { AstroMansion } from "astromansion";
 *
 * const client = new AstroMansion();                          // reads ASTROMANSION_API_KEY
 * const visitor = new AstroMansion({ requireKey: false });    // the visitor endpoints, no account
 * new AstroMansion({ apiKey: "" });                           // throws AuthenticationError when the environment holds no key either
 * ```
 */
export class AstroMansion extends EndpointMethods {
  /** The API root requests go to, without a trailing slash. */
  readonly baseUrl: string;
  /** Repeats allowed after a failed first attempt. */
  readonly maxRetries: number;
  readonly #apiKey: string | undefined;
  readonly #requireKey: boolean;
  readonly #transport: Transport;

  /**
   * Resolve the key and the root, and build the transport.
   *
   * @remarks
   * The key is checked here, before anything is sent, so a missing key is
   * reported as a missing key and never as a network failure.
   *
   * @param options - How the client is built. Every option may be left out.
   * @throws {@link AuthenticationError} when requireKey holds and no key was found.
   * @throws {@link AstroMansionError} with the code client_side_key, when a key would ship inside a browser page or a React Native app.
   * @throws {@link ValidationError} when baseUrl, timeoutMs, or maxRetries cannot be used.
   */
  constructor(options: ClientOptions = {}) {
    super();
    const settings = Settings.fromRuntime();
    const apiKey = resolveApiKey(options.apiKey, settings);
    const requireKey = options.requireKey ?? true;
    if (requireKey) {
      requireApiKey(apiKey);
    }
    guardClientSideKey(apiKey, options.dangerouslyAllowBrowser ?? false);
    this.#apiKey = apiKey;
    this.#requireKey = requireKey;
    this.baseUrl = resolveBaseUrl(options.baseUrl, settings);
    this.maxRetries = retryCount(options.maxRetries);
    this.#transport = new Transport({
      baseUrl: this.baseUrl,
      headers: buildHeaders(apiKey),
      timeoutMs: attemptTimeoutMs(options.timeoutMs),
      maxRetries: this.maxRetries,
      fetch: options.fetch ?? globalThis.fetch,
      wait: waitFor,
      random: () => Math.random(),
    });
  }

  /**
   * Call any published endpoint, including one this release has no method for.
   *
   * @remarks
   * The API publishes more endpoints than a release may name, so this is the
   * supported way to reach the rest. Authentication, timeouts, retries, and
   * error mapping behave exactly as for the named methods.
   *
   * @param method - The HTTP method.
   * @param path - A path beginning with /v1/. A URL is refused, since the key would go wherever it points.
   * @param options - The body, the query, and how the answer is read.
   * @returns The JSON value with its wrapper opened, text for a text/plain answer, or bytes for a document.
   * @throws {@link ValidationError} when the method, the path, or the body is refused before sending, or when the API answers 422.
   * @throws {@link AuthenticationError} when a key is needed and none was found, or when the API answers 401.
   * @throws {@link AstroMansionConnectionError} when no answer arrived after every retry.
   * @throws {@link AstroMansionError} or the subclass that names the cause, for any other refusal.
   *
   * @example
   * ```ts
   * const harmonics = await client.request("POST", "/v1/harmonics", {
   *   json: { birth: { date: "2000-01-01", lat: 51.4779, lon: 0 } },
   * });
   * const eclipses = await client.request("GET", "/v1/eclipses", { params: { year: 2027 } });
   * await client.request("GET", "https://elsewhere.example/v1/natal");   // throws ValidationError
   * ```
   */
  override async request(
    method: HttpMethod,
    path: string,
    options: RequestOptions = {},
  ): Promise<JsonValue | string | Uint8Array> {
    checkMethod(method);
    checkPath(path);
    if (method === "GET" && options.json !== undefined) {
      throw new ValidationError(
        "a GET request carries no body. Pass its values as params.",
        {
          errorCode: CLIENT_ERROR_CODES.VALIDATION,
        },
      );
    }
    if (options.requireKey ?? this.#requireKey) {
      requireApiKey(this.#apiKey);
    }
    const expectDocument = options.binary ?? false;
    const received = await this.#transport.send({
      method,
      path,
      json: options.json,
      params: options.params,
      expectDocument,
      signal: options.signal,
    });
    return decodeResponse(received, {
      expectDocument,
      enveloped: options.enveloped,
    });
  }

  /**
   * Describe the client with its key masked, since a description reaches logs.
   *
   * @returns The API root and the masked key.
   *
   * @example
   * ```ts
   * String(new AstroMansion({ apiKey: "am_Zx81qP0vT3kL9mN2bC7dE4fG6hJ1sR5w" }));
   * // "AstroMansion(baseUrl=https://api.astromansion.com, apiKey=am_Zx81q…sR5w)"
   * ```
   */
  override toString(): string {
    return `AstroMansion(baseUrl=${this.baseUrl}, apiKey=${maskApiKey(this.#apiKey)})`;
  }
}

/**
 * Refuse a method the API does not publish, for callers without type checks.
 *
 * @param method - The method a caller passed to request().
 * @throws {@link ValidationError} when the method is not GET, POST, or DELETE.
 */
function checkMethod(method: unknown): asserts method is HttpMethod {
  if (!HTTP_METHODS.some((known) => known === method)) {
    throw new ValidationError(
      `method must be one of ${HTTP_METHODS.join(", ")}, got ${String(method)}`,
      { errorCode: CLIENT_ERROR_CODES.VALIDATION },
    );
  }
}

/**
 * Read the maxRetries option.
 *
 * @param option - The option, or undefined for the default.
 * @returns The whole number of repeats, zero for a negative value.
 * @throws {@link ValidationError} when the value is not a finite number.
 */
function retryCount(option: number | undefined): number {
  const value = option ?? RETRY_POLICY.MAX_RETRIES;
  if (!Number.isFinite(value)) {
    throw new ValidationError(
      `maxRetries must be a finite number, got ${String(value)}`,
      {
        errorCode: CLIENT_ERROR_CODES.VALIDATION,
      },
    );
  }
  return Math.max(0, Math.trunc(value));
}

/**
 * Read the timeoutMs option.
 *
 * @param option - The option, or undefined for the default.
 * @returns The timeout of one attempt, in milliseconds.
 * @throws {@link ValidationError} when the value is not a positive finite number.
 */
function attemptTimeoutMs(option: number | undefined): number {
  const value = option ?? TRANSPORT_TIMING.ATTEMPT_TIMEOUT_MS;
  if (!Number.isFinite(value) || value <= 0) {
    throw new ValidationError(
      `timeoutMs must be a positive number of milliseconds, got ${String(value)}`,
      { errorCode: CLIENT_ERROR_CODES.VALIDATION },
    );
  }
  return value;
}
