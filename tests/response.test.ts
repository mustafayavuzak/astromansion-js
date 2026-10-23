// PATH: tests/response.test.ts

/**
 * RESULT TESTS: the Python SDK's Result, its examples and its rules
 *
 * Purpose:
 *   The examples of the Python SDK's response.py, and the rules a Result
 *   keeps in JavaScript: the data's fields are its own, its own names win
 *   over a field of the same name except result, and it cannot be changed.
 */

import { describe, expect, it } from "vitest";
import type { JsonValue } from "../src/models/records/json.ts";
import { Result } from "../src/response.ts";
import { isJsonObject, parseJsonBody } from "../src/responses/json.ts";

describe("Result.isEnvelope", () => {
  it.each<[string, JsonValue, boolean]>([
    ["exactly technique and result", { technique: "chart", result: {} }, true],
    ["a third member", { technique: "chart", result: {}, page: 1 }, false],
    ["a technique that is not text", { technique: 7, result: {} }, false],
    ["a result alone", { result: {} }, false],
    ["a list", [], false],
    ["text", "chart", false],
  ])("reads a body of %s: %s", (_case, payload, expected) => {
    expect(Result.isEnvelope(payload)).toBe(expected);
  });
});

describe("Result.build", () => {
  it("opens the wrapper the body recognisably is, keeping the body", () => {
    const body = {
      technique: "chart",
      result: { summary: { Sun: { sign: "Leo" } } },
    };

    const chart = Result.build(body);

    expect(chart.data).toEqual({ summary: { Sun: { sign: "Leo" } } });
    expect(chart.technique).toBe("chart");
    expect(chart.raw).toEqual(body);
    const summary: unknown = Reflect.get(chart, "summary");
    expect(summary).toEqual({ Sun: { sign: "Leo" } });
  });

  it("names a direct answer for the endpoint called", () => {
    expect(Result.build({ planets: [] }, "natal").technique).toBe("natal");
  });

  it("keeps a body whole when the schema says it is not wrapped", () => {
    const body = { technique: "x", result: { a: 1 } };

    const flat = Result.build(body, undefined, false);

    expect(flat.data).toEqual(body);
    expect(flat.technique).toBeUndefined();
  });

  it("opens a declared wrapper even when the body looks unusual", () => {
    const declared = Result.build(
      { technique: "x", result: { a: 1 }, extra: 2 },
      undefined,
      true,
    );

    expect(declared.data).toEqual({ a: 1 });
  });

  it("reads a list's items by index", () => {
    const rows = Result.build([{ name: "Sun" }, { name: "Moon" }]);

    const second: unknown = Reflect.get(rows, "1");
    expect(second).toEqual({ name: "Moon" });
    expect(rows.data).toHaveLength(2);
  });
});

describe("a Result's own names", () => {
  it("gives the payload's own result field before the alias", () => {
    const built = Result.build({ result: "won", score: 3, technique: "match" });

    expect(built.result).toBe("won");
  });

  it("gives the data under result when the payload has no result field", () => {
    expect(Result.build({ a: 1 }).result).toEqual({ a: 1 });
  });

  it.each(["data", "raw", "technique", "toDict", "toString"])(
    "keeps %s its own, and leaves the data's field of that name to data",
    (name) => {
      const built = Result.build({ [name]: "the field", other: 1 }, "named");

      const data: JsonValue = built.data;
      expect(isJsonObject(data) ? data[name] : undefined).toBe("the field");
      expect(Reflect.get(built, name)).not.toBe("the field");
    },
  );

  it("returns the data as plain JSON from toDict", () => {
    const body = { planets: [{ name: "Sun" }] };

    expect(Result.build(body).toDict()).toEqual(body);
  });

  it("returns a copy of an object payload from toDict, and a list itself", () => {
    const built = Result.build({ a: 1 });
    const copy: JsonValue = built.toDict();
    const list = [1, 2];

    expect(isJsonObject(copy) && Reflect.set(copy, "a", 2)).toBe(true);
    expect(built.data).toEqual({ a: 1 });
    expect(Result.build(list).toDict()).toBe(list);
  });

  it("lists the data's fields, and not its own names", () => {
    expect(Object.keys(Result.build({ a: 1, b: 2 }))).toEqual(["a", "b"]);
  });

  it("writes JSON as the data's fields", () => {
    expect(JSON.stringify(Result.build({ a: 1 }))).toBe('{"a":1}');
  });

  it("describes itself with its payload and its technique", () => {
    expect(String(Result.build({ a: 1 }, "natal"))).toBe(
      "Result({\"a\":1}, technique='natal')",
    );
    expect(String(Result.build({ a: 1 }))).toBe('Result({"a":1})');
  });
});

describe("a Result cannot be changed or misled", () => {
  it("is frozen", () => {
    const built = Result.build({ a: 1 });

    expect(Object.isFrozen(built)).toBe(true);
    expect(() => {
      Reflect.defineProperty(built, "a", { value: 2 });
      if (Reflect.get(built, "a") !== 1) {
        throw new Error("changed");
      }
    }).not.toThrow();
  });

  it("reads a field named __proto__ as a field, never as its prototype", () => {
    const payload =
      parseJsonBody('{"__proto__": {"polluted": true}, "a": 1}') ?? null;

    const built = Result.build(payload);

    expect(Reflect.get(built, "polluted")).toBeUndefined();
    expect(built).toBeInstanceOf(Result);
    expect(Object.getOwnPropertyNames(built)).toContain("__proto__");
  });

  it("tells a Result apart with instanceof", () => {
    expect(Result.build({})).toBeInstanceOf(Result);
    expect({}).not.toBeInstanceOf(Result);
  });
});
