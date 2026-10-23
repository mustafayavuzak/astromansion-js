// PATH: src/models/records/transport.ts

/**
 * TRANSPORT RECORDS: what the transport is built from, and what it sends
 *
 * Purpose:
 *   The client builds a transport once from a TransportConfig and hands it
 *   one OutgoingRequest per call. The clock and the random source are part
 *   of the configuration, so a test replaces both and never waits.
 */

import type { HttpMethod } from "../enums/http.ts";
import type { FetchFunction, QueryValue } from "./client.ts";
import type { JsonValue } from "./json.ts";

/**
 * Wait for a duration, or reject with the signal's reason as soon as it aborts.
 *
 * @internal
 */
export type WaitFunction = (
  durationMs: number,
  signal: AbortSignal | undefined,
) => Promise<void>;

/**
 * Everything a transport sends with, fixed when the client is built.
 *
 * @internal
 */
export interface TransportConfig {
  /** The API root, without a trailing slash. */
  readonly baseUrl: string;
  /** The headers every request carries, the key's included. */
  readonly headers: Readonly<Record<string, string>>;
  /** The longest one attempt may take, in milliseconds. */
  readonly timeoutMs: number;
  /** Repeats allowed after a failed first attempt. */
  readonly maxRetries: number;
  /** The fetch every attempt goes through. */
  readonly fetch: FetchFunction;
  /** How the transport waits between attempts. */
  readonly wait: WaitFunction;
  /** A source of numbers in [0, 1), for the jitter of each wait. */
  readonly random: () => number;
}

/**
 * One call, as the client hands it to the transport.
 *
 * @internal
 */
export interface OutgoingRequest {
  /** The HTTP method. */
  readonly method: HttpMethod;
  /** A published path, already checked, beginning with /v1/. */
  readonly path: string;
  /** The JSON body, absent for a GET. */
  readonly json?: JsonValue | undefined;
  /** The query parameters. Those set to undefined are left out. */
  readonly params?: Readonly<Record<string, QueryValue>> | undefined;
  /** Whether a success is a document, which decides how its body is read. */
  readonly expectDocument: boolean;
  /** The caller's cancellation. */
  readonly signal?: AbortSignal | undefined;
}
