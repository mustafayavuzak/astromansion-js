// PATH: tests/responses/json.test.ts

/**
 * JSON BODY TESTS: parsing a body, and telling its kinds of value apart
 */

import { describe, expect, it } from "vitest";
import type { JsonValue } from "../../src/models/records/json.ts";
import {
  isJsonArrayOf,
  isJsonObject,
  isJsonRecordOf,
  isJsonValue,
  parseJsonBody,
} from "../../src/responses/json.ts";

/** A test a checked item passes when it is a text. */
const isText = (value: JsonValue): boolean => typeof value === "string";

describe("parseJsonBody", () => {
  it.each<[string, JsonValue]>([
    ['{"sign": "Leo"}', { sign: "Leo" }],
    ["[1, 2]", [1, 2]],
    ["null", null],
    ["7", 7],
  ])("parses %s", (text, value) => {
    expect(parseJsonBody(text)).toEqual(value);
  });

  it.each(["Saturn Taurus", "", "{broken"])("reads %j as no JSON", (text) => {
    expect(parseJsonBody(text)).toBeUndefined();
  });
});

describe("isJsonObject", () => {
  it.each<[string, JsonValue | undefined, boolean]>([
    ["an object", { sign: "Leo" }, true],
    ["an array", [1], false],
    ["null", null, false],
    ["text", "Leo", false],
    ["undefined", undefined, false],
  ])("tells %s", (_case, value, expected) => {
    expect(isJsonObject(value)).toBe(expected);
  });
});

describe("isJsonValue", () => {
  it.each<[string, JsonValue | undefined, boolean]>([
    ["null, a value the server sent", null, true],
    ["false", false, true],
    ["a missing member", undefined, false],
  ])("tells %s", (_case, value, expected) => {
    expect(isJsonValue(value)).toBe(expected);
  });
});

describe("isJsonArrayOf", () => {
  it.each<[string, JsonValue | undefined, boolean]>([
    ["a list of texts", ["Leo", "Virgo"], true],
    ["an empty list", [], true],
    ["a list holding a number", ["Leo", 5], false],
    ["an object", { sign: "Leo" }, false],
    ["a missing member", undefined, false],
  ])("tells %s", (_case, value, expected) => {
    expect(isJsonArrayOf(value, isText)).toBe(expected);
  });

  it("passes every item of a list without an item test", () => {
    expect(isJsonArrayOf([1, "Leo", null])).toBe(true);
  });
});

describe("isJsonRecordOf", () => {
  it.each<[string, JsonValue | undefined, boolean]>([
    ["an object of texts", { code: "quota" }, true],
    ["an empty object", {}, true],
    ["an object holding a number", { code: 429 }, false],
    ["a list", ["quota"], false],
    ["null", null, false],
  ])("tells %s", (_case, value, expected) => {
    expect(isJsonRecordOf(value, isText)).toBe(expected);
  });
});
