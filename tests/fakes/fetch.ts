// PATH: tests/fakes/fetch.ts

/**
 * FAKE FETCH: a fetch that answers from a script, for tests
 *
 * Purpose:
 *   The client takes fetch as an option, so the suite hands it this fake and
 *   never reaches the network. Each call takes the next step of the script
 *   and records what it was asked:
 *
 *     answer   a Response with the step's status, body, and headers
 *     fail     the step's error, thrown as fetch throws a network failure
 *     hang     no answer until the request's signal aborts, as a slow server
 *
 *   A call beyond the end of the script fails, so a test that expects no
 *   retry learns at once when one happens.
 */

import type { FetchFunction } from "../../src/models/records/client.ts";
import type { JsonValue } from "../../src/models/records/json.ts";

/** A scripted answer. */
export interface ScriptedAnswer {
  readonly status: number;
  readonly body?: string | Uint8Array<ArrayBuffer> | undefined;
  readonly headers?: Readonly<Record<string, string>> | undefined;
}

/** A scripted network failure. */
export interface ScriptedFailure {
  readonly fail: Error;
}

/** A scripted silence, ended only by the request's signal. */
export interface ScriptedHang {
  readonly hang: true;
}

/** One step of a script. */
export type ScriptedStep = ScriptedAnswer | ScriptedFailure | ScriptedHang;

/** What one call to the fake was asked. */
export interface RecordedCall {
  readonly url: string;
  readonly method: string | undefined;
  readonly headers: Headers;
  readonly body: string | undefined;
  readonly signal: AbortSignal | undefined;
}

/**
 * A fetch that plays a script and records every call.
 *
 * @example
 * ```ts
 * const fake = new FakeFetch([{ status: 503 }, jsonAnswer(200, { ok: true })]);
 * await fake.fetch("https://api.example.test/v1/natal", { method: "POST" });   // the 503
 * fake.calls.length;                                                          // 1
 * ```
 */
export class FakeFetch {
  /** Every call made so far, oldest first. */
  readonly calls: RecordedCall[] = [];
  readonly #steps: ScriptedStep[];

  /**
   * Hold the script.
   *
   * @param steps - The steps, played in order, one per call.
   */
  constructor(steps: readonly ScriptedStep[]) {
    this.#steps = [...steps];
  }

  /** The fetch to hand to the client or the transport. */
  readonly fetch: FetchFunction = (input, init) => {
    this.calls.push({
      url: input,
      method: init.method,
      headers: new Headers(init.headers),
      body: typeof init.body === "string" ? init.body : undefined,
      signal: init.signal ?? undefined,
    });
    const step = this.#steps.shift();
    if (step === undefined) {
      return Promise.reject(new Error(`unscripted call to ${input}`));
    }
    if ("fail" in step) {
      return Promise.reject(step.fail);
    }
    if ("hang" in step) {
      return hangUntilAborted(init.signal ?? undefined);
    }
    return Promise.resolve(
      new Response(step.body ?? null, {
        status: step.status,
        headers: step.headers ?? {},
      }),
    );
  };
}

/**
 * Script a JSON answer.
 *
 * @param status - The HTTP status.
 * @param payload - The body, serialized as JSON.
 * @param headers - Further headers, beside the JSON content type.
 * @returns The scripted answer.
 */
export function jsonAnswer(
  status: number,
  payload: JsonValue,
  headers: Readonly<Record<string, string>> = {},
): ScriptedAnswer {
  return {
    status,
    body: JSON.stringify(payload),
    headers: { "Content-Type": "application/json", ...headers },
  };
}

/**
 * Wait, as a silent server would, until the request is aborted.
 *
 * @param signal - The request's signal.
 * @returns A promise that rejects with the signal's reason when it aborts, and never settles otherwise.
 */
function hangUntilAborted(signal: AbortSignal | undefined): Promise<Response> {
  return new Promise<Response>((_resolve, reject) => {
    signal?.addEventListener(
      "abort",
      () => {
        const reason: unknown = signal.reason;
        reject(reason instanceof Error ? reason : new Error("aborted"));
      },
      { once: true },
    );
  });
}
