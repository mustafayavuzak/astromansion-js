// PATH: tests/transport/transport.test.ts

/**
 * TRANSPORT TESTS: the URL, the retries, the timeout, and the caller's cancellation
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { API_HEADERS } from "../../src/models/constants/api.ts";
import { TRANSPORT_TIMING } from "../../src/models/constants/transport.ts";
import {
  AstroMansionConnectionError,
  ValidationError,
} from "../../src/models/errors/api.ts";
import type {
  OutgoingRequest,
  TransportConfig,
} from "../../src/models/records/transport.ts";
import { backoffDelayMs } from "../../src/transport/backoff.ts";
import { Transport, waitFor } from "../../src/transport/transport.ts";
import { FakeFetch, type ScriptedStep, jsonAnswer } from "../fakes/fetch.ts";
import { RecordedWaits } from "../fakes/wait.ts";
import { GREENWICH_BIRTH, ISSUED_KEY, STAGING_ROOT } from "../fixtures.ts";

/** The random source of these tests, the middle of [0, 1). */
const MIDDLE = (): number => 0.5;

/** A natal chart request, as the client hands it over. */
const NATAL: OutgoingRequest = {
  method: "POST",
  path: "/v1/natal",
  json: { birth: GREENWICH_BIRTH },
  expectDocument: false,
};

/** What a test works with: the transport, the fetch it calls, and the waits it made. */
interface Harness {
  readonly transport: Transport;
  readonly fake: FakeFetch;
  readonly waits: RecordedWaits;
}

/**
 * Build a transport over a script.
 *
 * @param steps - The answers and failures fetch plays, in order.
 * @param changes - Configuration that differs from the defaults of these tests.
 * @returns The transport, its fake fetch, and its recorded waits.
 */
function harness(
  steps: readonly ScriptedStep[],
  changes: Partial<Pick<TransportConfig, "maxRetries" | "timeoutMs">> = {},
): Harness {
  const fake = new FakeFetch(steps);
  const waits = new RecordedWaits();
  const transport = new Transport({
    baseUrl: STAGING_ROOT,
    headers: { [API_HEADERS.KEY]: ISSUED_KEY },
    timeoutMs: changes.timeoutMs ?? TRANSPORT_TIMING.ATTEMPT_TIMEOUT_MS,
    maxRetries: changes.maxRetries ?? 2,
    fetch: fake.fetch,
    wait: waits.wait,
    random: MIDDLE,
  });
  return { transport, fake, waits };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("Transport.send", () => {
  it("sends to the root and the path, with the headers and the JSON body", async () => {
    const { transport, fake } = harness([jsonAnswer(200, {})]);

    await transport.send(NATAL);

    expect(fake.calls).toHaveLength(1);
    expect(fake.calls[0]).toMatchObject({
      url: `${STAGING_ROOT}/v1/natal`,
      method: "POST",
      body: JSON.stringify({ birth: GREENWICH_BIRTH }),
    });
    expect(fake.calls[0]?.headers.get(API_HEADERS.KEY)).toBe(ISSUED_KEY);
  });

  it("adds every defined query parameter and leaves the undefined ones out", async () => {
    const { transport, fake } = harness([jsonAnswer(200, {})]);

    await transport.send({
      method: "GET",
      path: "/v1/eclipses",
      params: { year: 2027, lang: undefined },
      expectDocument: false,
    });

    expect(fake.calls[0]).toMatchObject({
      url: `${STAGING_ROOT}/v1/eclipses?year=2027`,
      body: undefined,
    });
  });

  it("refuses a body JSON cannot hold, unsent and without a retry", async () => {
    const { transport, fake, waits } = harness([jsonAnswer(200, {})]);

    await expect(
      transport.send({
        ...NATAL,
        // @ts-expect-error -- a caller without type checks can pass a value JSON cannot hold
        json: { year: 2027n },
      }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(fake.calls).toHaveLength(0);
    expect(waits.durationsMs).toEqual([]);
  });

  it("retries a 503 and returns the answer that follows", async () => {
    const { transport, fake, waits } = harness([
      { status: 503 },
      jsonAnswer(200, {}),
    ]);

    const response = await transport.send(NATAL);

    expect(response.status).toBe(200);
    expect(fake.calls).toHaveLength(2);
    expect(waits.durationsMs).toEqual([backoffDelayMs(0, undefined, MIDDLE)]);
  });

  it("waits as long as Retry-After asks before retrying a rate limit", async () => {
    const { transport, waits } = harness([
      jsonAnswer(
        429,
        { error: { code: "rate_limited" } },
        { "Retry-After": "2" },
      ),
      jsonAnswer(200, {}),
    ]);

    await transport.send(NATAL);

    expect(waits.durationsMs).toEqual([2 * TRANSPORT_TIMING.MS_PER_SECOND]);
  });

  it("never retries a spent quota", async () => {
    const { transport, fake, waits } = harness([
      jsonAnswer(429, { error: { code: "quota_exceeded" } }),
    ]);

    const response = await transport.send(NATAL);

    expect(response.status).toBe(429);
    expect(fake.calls).toHaveLength(1);
    expect(waits.durationsMs).toEqual([]);
  });

  it("never retries a refusal the caller must fix", async () => {
    const { transport, fake } = harness([jsonAnswer(422, { detail: [] })]);

    const response = await transport.send(NATAL);

    expect(response.status).toBe(422);
    expect(fake.calls).toHaveLength(1);
  });

  it("returns the last answer when the retries are spent", async () => {
    const { transport, fake, waits } = harness([
      { status: 503 },
      { status: 503 },
      { status: 503 },
    ]);

    const response = await transport.send(NATAL);

    expect(response.status).toBe(503);
    expect(fake.calls).toHaveLength(3);
    expect(waits.durationsMs).toHaveLength(2);
  });

  it("retries a network failure", async () => {
    const { transport, waits } = harness([
      { fail: new TypeError("fetch failed") },
      jsonAnswer(200, {}),
    ]);

    const response = await transport.send(NATAL);

    expect(response.status).toBe(200);
    expect(waits.durationsMs).toHaveLength(1);
  });

  it("reports a connection error once every attempt failed, with the last failure as its cause", async () => {
    const last = new TypeError("getaddrinfo ENOTFOUND api.example.test");
    const { transport, fake } = harness([
      { fail: new TypeError("fetch failed") },
      { fail: new TypeError("fetch failed") },
      { fail: last },
    ]);

    const sending = transport.send(NATAL);

    await expect(sending).rejects.toBeInstanceOf(AstroMansionConnectionError);
    await expect(sending).rejects.toMatchObject({ cause: last });
    await expect(sending).rejects.toThrow(last.message);
    expect(fake.calls).toHaveLength(3);
  });

  it("stops before fetch when the caller has already aborted", async () => {
    const { transport, fake } = harness([jsonAnswer(200, {})]);
    const controller = new AbortController();
    const stop = new Error("the user left the page");
    controller.abort(stop);

    await expect(
      transport.send({ ...NATAL, signal: controller.signal }),
    ).rejects.toBe(stop);
    expect(fake.calls).toHaveLength(0);
  });

  it("returns the caller's own reason when it aborts an attempt, without retrying", async () => {
    const { transport, fake, waits } = harness([
      { hang: true },
      jsonAnswer(200, {}),
    ]);
    const controller = new AbortController();
    const stop = new Error("the user left the page");

    const sending = transport.send({ ...NATAL, signal: controller.signal });
    controller.abort(stop);

    await expect(sending).rejects.toBe(stop);
    expect(fake.calls).toHaveLength(1);
    expect(waits.durationsMs).toEqual([]);
  });

  it("hands the caller's signal to every wait", async () => {
    const { transport, waits } = harness([
      { status: 503 },
      jsonAnswer(200, {}),
    ]);
    const controller = new AbortController();

    await transport.send({ ...NATAL, signal: controller.signal });

    expect(waits.signals).toEqual([controller.signal]);
  });

  it("ends an attempt that outlasts its timeout as a failure without an answer", async () => {
    vi.useFakeTimers();
    const timeoutMs = 1_000;
    const { transport } = harness([{ hang: true }], {
      maxRetries: 0,
      timeoutMs,
    });

    const sending = transport.send(NATAL);
    const failure = expect(sending).rejects.toThrow(
      `no answer within ${String(timeoutMs)} ms`,
    );
    await vi.advanceTimersByTimeAsync(timeoutMs);

    await failure;
  });

  it("reads a successful document as bytes", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const { transport } = harness([
      { status: 200, body: png, headers: { "Content-Type": "image/png" } },
    ]);

    const response = await transport.send({
      ...NATAL,
      path: "/v1/render/png",
      expectDocument: true,
    });

    expect(response.body).toEqual({ kind: "bytes", bytes: png });
  });

  it("reads the refusal of a document request as text", async () => {
    const { transport } = harness([
      jsonAnswer(404, { error: { code: "not_found" } }),
    ]);

    const response = await transport.send({
      ...NATAL,
      path: "/v1/render/png",
      expectDocument: true,
    });

    expect(response.body.kind).toBe("text");
  });
});

describe("waitFor", () => {
  it("settles once the duration has passed", async () => {
    vi.useFakeTimers();
    let settled = false;

    const waiting = waitFor(500, undefined).then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(499);
    const early = settled;
    await vi.advanceTimersByTimeAsync(1);
    await waiting;

    expect([early, settled]).toEqual([false, true]);
  });

  it("rejects at once with the reason of a signal that has already aborted", async () => {
    const controller = new AbortController();
    const stop = new Error("cancelled");
    controller.abort(stop);

    await expect(waitFor(10_000, controller.signal)).rejects.toBe(stop);
  });

  it("ends early with the signal's reason when the signal aborts", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const stop = new Error("cancelled");

    const waiting = waitFor(10_000, controller.signal);
    controller.abort(stop);

    await expect(waiting).rejects.toBe(stop);
  });
});
