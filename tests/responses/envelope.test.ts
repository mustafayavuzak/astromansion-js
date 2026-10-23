// PATH: tests/responses/envelope.test.ts

/**
 * ENVELOPE TESTS: the {technique, result} wrapper opens only where it should
 */

import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/models/records/json.ts";
import { isEnvelope, openEnvelope } from "../../src/responses/envelope.ts";

/** A wrapped answer, as a registry technique sends one. */
const WRAPPED = { technique: "transits", result: { hits: [] } } as const;

describe("isEnvelope", () => {
  it.each<[string, JsonValue, boolean]>([
    ["exactly the wrapper", WRAPPED, true],
    [
      "a wrapper with a null result",
      { technique: "transits", result: null },
      true,
    ],
    ["a third member", { ...WRAPPED, page: 1 }, false],
    ["a technique that is not text", { technique: 7, result: {} }, false],
    ["a result alone", { result: {} }, false],
    ["an array", [WRAPPED], false],
    ["null", null, false],
  ])("recognises %s as %s", (_case, payload, expected) => {
    expect(isEnvelope(payload)).toBe(expected);
  });
});

describe("openEnvelope", () => {
  it.each<[string, JsonValue, boolean | undefined, JsonValue]>([
    ["undefined opens the exact wrapper", WRAPPED, undefined, WRAPPED.result],
    [
      "undefined keeps a body with a third member",
      { ...WRAPPED, page: 1 },
      undefined,
      { ...WRAPPED, page: 1 },
    ],
    ["true opens any object with a result", { result: 1, page: 2 }, true, 1],
    [
      "true keeps a body without a result",
      { summary: {} },
      true,
      { summary: {} },
    ],
    ["false never opens", WRAPPED, false, WRAPPED],
    [
      "undefined keeps plain data",
      { summary: { Sun: "Leo" } },
      undefined,
      { summary: { Sun: "Leo" } },
    ],
  ])("%s", (_case, payload, enveloped, expected) => {
    expect(openEnvelope(payload, enveloped)).toEqual(expected);
  });
});
