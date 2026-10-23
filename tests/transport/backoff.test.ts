// PATH: tests/transport/backoff.test.ts

/**
 * BACKOFF TESTS: reading Retry-After and computing the wait before a retry
 */

import { describe, expect, it } from "vitest";
import { TRANSPORT_TIMING } from "../../src/models/constants/transport.ts";
import {
  backoffDelayMs,
  parseRetryAfterSeconds,
  retryAfterSeconds,
} from "../../src/transport/backoff.ts";

describe("parseRetryAfterSeconds", () => {
  it.each([
    ["3", 3],
    ["0", 0],
    ["1.5", 1.5],
    [" 2 ", 2],
    ["-1", 0],
  ])("reads %j as %d seconds", (value, seconds) => {
    expect(parseRetryAfterSeconds(value)).toBe(seconds);
  });

  it.each([
    ["an HTTP date", "Wed, 21 Oct 2026 07:28:00 GMT"],
    ["empty text", ""],
    ["a hexadecimal number", "0x10"],
    ["an exponent", "1e3"],
    ["an absent header", null],
  ])("ignores %s", (_case, value) => {
    expect(parseRetryAfterSeconds(value)).toBeUndefined();
  });
});

describe("retryAfterSeconds", () => {
  it("reads the Retry-After header of a response", () => {
    expect(retryAfterSeconds(new Headers({ "Retry-After": "4" }))).toBe(4);
  });
});

describe("backoffDelayMs", () => {
  const lowest = (): number => 0;

  it("waits as long as the server asked, in milliseconds", () => {
    expect(backoffDelayMs(0, 3, lowest)).toBe(
      3 * TRANSPORT_TIMING.MS_PER_SECOND,
    );
  });

  it("caps the server's pause at the ceiling", () => {
    expect(backoffDelayMs(0, 600, lowest)).toBe(
      TRANSPORT_TIMING.BACKOFF_CEILING_MS,
    );
  });

  it("keeps at least the floor share of the first window", () => {
    expect(backoffDelayMs(0, undefined, lowest)).toBe(
      TRANSPORT_TIMING.BACKOFF_BASE_MS * TRANSPORT_TIMING.JITTER_FLOOR_FRACTION,
    );
  });

  it("never exceeds the window, whatever the random share", () => {
    expect(backoffDelayMs(0, undefined, () => 0.999_999)).toBeLessThanOrEqual(
      TRANSPORT_TIMING.BACKOFF_BASE_MS,
    );
  });

  it("doubles the window with every failed attempt", () => {
    expect(backoffDelayMs(1, undefined, lowest)).toBe(
      2 * backoffDelayMs(0, undefined, lowest),
    );
  });

  it("stops growing at the ceiling", () => {
    expect(backoffDelayMs(30, undefined, lowest)).toBe(
      TRANSPORT_TIMING.BACKOFF_CEILING_MS *
        TRANSPORT_TIMING.JITTER_FLOOR_FRACTION,
    );
  });
});
