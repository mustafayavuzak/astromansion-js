// PATH: tests/fakes/wait.ts

/**
 * FAKE WAIT: a wait that records its durations and returns at once
 *
 * Purpose:
 *   The transport takes its wait as configuration, so the suite hands it
 *   this fake and never sleeps. A test reads the durations to check the
 *   backoff, and the signals to check that a cancellation reached the wait.
 */

import type { WaitFunction } from "../../src/models/records/transport.ts";

/**
 * A wait that settles at once and remembers what it was asked.
 *
 * @example
 * ```ts
 * const waits = new RecordedWaits();
 * await waits.wait(500, undefined);
 * waits.durationsMs;   // [500]
 * ```
 */
export class RecordedWaits {
  /** Every duration asked for, in milliseconds, oldest first. */
  readonly durationsMs: number[] = [];
  /** The signal each wait was given, oldest first. */
  readonly signals: (AbortSignal | undefined)[] = [];

  /** The wait to hand to the transport. */
  readonly wait: WaitFunction = (durationMs, signal) => {
    this.durationsMs.push(durationMs);
    this.signals.push(signal);
    return Promise.resolve();
  };
}
