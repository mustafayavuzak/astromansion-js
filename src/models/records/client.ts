// PATH: src/models/records/client.ts

/**
 * CLIENT RECORDS: the options a client and one of its requests accept
 *
 * Purpose:
 *   The shapes a caller writes when building a client and when calling
 *   request(). Every option may be left out, and leaving one out means the
 *   default its documentation names.
 */

import type { JsonValue } from "./json.ts";

/**
 * A function with the signature of the platform's fetch.
 *
 * @remarks
 * Pass one to send through a proxy or Tor, for example a fetch bound to an
 * undici ProxyAgent or a SOCKS agent. The client never adds a dependency of
 * its own for that.
 */
export type FetchFunction = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

/** A query parameter's value. An undefined value leaves the parameter out. */
export type QueryValue = string | number | boolean | undefined;

/** How a client is built. */
export interface ClientOptions {
  /**
   * The API key. Blank text counts as no key.
   *
   * @defaultValue the ASTROMANSION_API_KEY environment variable
   */
  readonly apiKey?: string | undefined;
  /**
   * The API root. A trailing slash is trimmed.
   *
   * @defaultValue the ASTROMANSION_BASE_URL environment variable, then https://api.astromansion.com
   */
  readonly baseUrl?: string | undefined;
  /**
   * The longest one attempt may take, in milliseconds, from sending the
   * request to the last byte of the answer.
   *
   * @defaultValue 30000
   */
  readonly timeoutMs?: number | undefined;
  /**
   * Repeats allowed after a failed first attempt, for a connection failure,
   * a rate limit, or a server error. A refusal the caller must fix is never
   * repeated. A negative value counts as zero.
   *
   * @defaultValue 2
   */
  readonly maxRetries?: number | undefined;
  /**
   * Refuse before the network when no key is available. False reaches the
   * endpoints the API serves to visitors without an account.
   *
   * @defaultValue true
   */
  readonly requireKey?: boolean | undefined;
  /**
   * The fetch to send through.
   *
   * @defaultValue the runtime's global fetch
   */
  readonly fetch?: FetchFunction | undefined;
  /**
   * Allow a key in a browser page or a React Native app, where every user of
   * the app can read it. Leave it false and call the API from your own
   * server, or build a visitor client with requireKey false and no key.
   *
   * @defaultValue false
   */
  readonly dangerouslyAllowBrowser?: boolean | undefined;
}

/** How one call to request() is sent and read. */
export interface RequestOptions {
  /** The JSON body. A GET request takes none. */
  readonly json?: JsonValue | undefined;
  /** The query parameters. Those set to undefined are left out. */
  readonly params?: Readonly<Record<string, QueryValue>> | undefined;
  /**
   * Whether this call needs a key.
   *
   * @defaultValue the client's requireKey
   */
  readonly requireKey?: boolean | undefined;
  /**
   * Whether a success is a document, such as a PNG, a PDF, an SVG, or a CSV,
   * rather than JSON. A document comes back as bytes, or as text when the
   * server sends text/plain.
   *
   * @defaultValue false
   */
  readonly binary?: boolean | undefined;
  /**
   * Whether a success is wrapped in `{technique, result}`. True opens any
   * body that has a result member, false never opens one, and undefined
   * opens a body only when it is exactly the wrapper. Pass false to read the
   * body exactly as the server sent it.
   *
   * @defaultValue undefined
   */
  readonly enveloped?: boolean | undefined;
  /** Cancels the call wherever it is, in an attempt or in a wait between attempts. */
  readonly signal?: AbortSignal | undefined;
}

/**
 * How one call to a named method is sent.
 *
 * @remarks
 * A named method knows its path, its body, and how its answer is read, so
 * only the cancellation is left to the caller.
 *
 * @example
 * ```ts
 * const timeout = AbortSignal.timeout(10_000);
 * await client.natal({ birth }, { signal: timeout });   // gives up after 10 seconds
 * ```
 */
export type CallOptions = Pick<RequestOptions, "signal">;
