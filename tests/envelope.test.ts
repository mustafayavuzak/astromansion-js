// PATH: tests/envelope.test.ts

/**
 * ENVELOPE TESTS: the Python SDK's tests/test_envelope.py, case by case
 *
 * Purpose:
 *   An answer reads the same way whatever shape the server sent it in. Some
 *   endpoints answer with the data itself and some wrap it in
 *   {technique, result}, a server detail that has nothing to do with the
 *   caller's request.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AstroMansion } from "../src/client.ts";
import { API_ENVIRONMENT } from "../src/models/constants/api.ts";
import type { JsonValue } from "../src/models/records/json.ts";
import { Result } from "../src/response.ts";
import { FakeFetch, jsonAnswer, type ScriptedStep } from "./fakes/fetch.ts";

const KEY = "am_live_testkey_0123456789abcdef";
const BIRTH = Object.freeze({ date: "2000-01-01", lat: 51.4779, lon: 0 });
const NATAL = Object.freeze({
  summary: { Sun: { sign: "Capricorn", dms: "10°49′35″" } },
  planets: [],
  aspects: [],
}) satisfies JsonValue;
const DATA = Object.freeze({
  summary: { Sun: { sign: "Leo" } },
  aspects: [],
}) satisfies JsonValue;
const WRAPPED = Object.freeze({ technique: "chart", result: DATA });

/**
 * Build a client over a script, without retries.
 *
 * @param steps - The answers the fetch gives, in order.
 * @returns The client.
 */
function clientOver(steps: readonly ScriptedStep[]): AstroMansion {
  return new AstroMansion({
    apiKey: KEY,
    maxRetries: 0,
    fetch: new FakeFetch(steps).fetch,
  });
}

beforeEach(() => {
  vi.stubEnv(API_ENVIRONMENT.KEY, "");
});

describe("an answer reads the same whatever its shape", () => {
  it("reads a direct answer flat, named for the endpoint called", async () => {
    const response = await clientOver([jsonAnswer(200, NATAL)]).natal(BIRTH);

    expect(response.summary["Sun"]?.sign).toBe("Capricorn");
    expect(response.technique).toBe("natal");
  });

  it("reads a wrapped answer the same way, named as the server named it", async () => {
    const response = await clientOver([jsonAnswer(200, WRAPPED)]).chart(BIRTH);

    const summary: unknown = Reflect.get(response, "summary");
    expect(summary).toEqual(DATA.summary);
    expect(response.technique).toBe("chart");
  });

  it("keeps the body exactly as the server sent it", async () => {
    const response = await clientOver([jsonAnswer(200, WRAPPED)]).chart(BIRTH);

    expect(response.raw).toEqual(WRAPPED);
  });

  it("keeps the server's own name for the data reachable", async () => {
    const response = await clientOver([jsonAnswer(200, WRAPPED)]).chart(BIRTH);

    expect(response.result).toEqual(DATA);
    expect(response.data).toEqual(DATA);
  });

  it("reads a list through data, a list having no fields to offer", async () => {
    const rows = [{ name: "Kingship", sign: "Gemini" }];
    const response = await clientOver([
      jsonAnswer(200, { technique: "query", result: rows }),
    ]).query({ birth: BIRTH });

    if (typeof response === "string") {
      throw new Error("the query answered with text");
    }
    expect(response.technique).toBe("query");
    expect(response.data).toEqual(rows);
    const name: unknown = Reflect.get(response, "name");
    expect(name).toBeUndefined();
  });

  it("leaves a payload with a result field of its own unopened", () => {
    const payload = { result: "won", score: 3, technique: "match" };

    const built = Result.build(payload, "whatever", undefined);

    const score: unknown = Reflect.get(built, "score");
    expect(score).toBe(3);
    expect(built.result).toBe("won");
  });

  it("lets the schema decide when it knows", () => {
    const declared = Result.build(
      { technique: "x", result: { a: 1 }, extra: 2 },
      undefined,
      true,
    );
    const flat = Result.build(
      { technique: "x", result: { a: 1 } },
      undefined,
      false,
    );

    const a: unknown = Reflect.get(declared, "a");
    expect(a).toBe(1);
    expect(flat.technique).toBeUndefined();
    expect(flat.data).toEqual({ technique: "x", result: { a: 1 } });
    expect(flat.result).toEqual({ a: 1 });
  });

  it("reads a running job's status whole, never as its empty result", async () => {
    const status = {
      id: "j1",
      state: "running",
      technique: "transits",
      kind: "single",
      result: null,
      error: null,
      created_at: "2026-10-23T09:00:00Z",
      finished_at: null,
      webhook: null,
    };

    const job = await clientOver([jsonAnswer(200, status)]).job("j1");

    expect(job.state).toBe("running");
    expect(job.result).toBeNull();
    expect(job.data).toEqual(status);
  });
});
