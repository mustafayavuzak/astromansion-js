// PATH: tests/requestBodies.test.ts

/**
 * REQUEST BODY TESTS: the examples of the Python SDK's _bodies.py, and the rules of its arguments
 *
 * Purpose:
 *   A birth is checked before it is sent, with the Python SDK's messages,
 *   and each request shape builds the body its endpoints declare.
 */

import { describe, expect, it } from "vitest";
import { ValidationError } from "../src/models/errors/api.ts";
import { RequestBodies } from "../src/requestBodies.ts";

const BIRTH = Object.freeze({ date: "2000-01-01", lat: 51.4779, lon: 0 });

describe("RequestBodies.birth", () => {
  it("keeps only the fields that were given, in the Python SDK's order", () => {
    expect(
      Object.keys(
        RequestBodies.birth("natal", {
          houses: "whole",
          timezone: 3,
          time: "12:00",
          lon: 0,
          lat: 51.4779,
          date: "2000-01-01",
        }),
      ),
    ).toEqual(["date", "lat", "lon", "time", "timezone", "houses"]);
    expect(RequestBodies.birth("natal", BIRTH)).toEqual(BIRTH);
  });

  it("reads coordinates written as numeric text as numbers, as Python's float() does", () => {
    expect(
      RequestBodies.birth("natal", {
        date: "2000-01-01",
        lat: " 51.4779 ",
        lon: "0",
      }),
    ).toEqual({ date: "2000-01-01", lat: 51.4779, lon: 0 });
  });

  it.each<[string, Readonly<Record<string, unknown>>, string]>([
    [
      "a date written day first",
      { ...BIRTH, date: "01-01-2000" },
      "date must look like YYYY-MM-DD, got '01-01-2000'",
    ],
    [
      "a time with AM or PM",
      { ...BIRTH, time: "12:00 PM" },
      "time must look like HH:MM, got '12:00 PM'",
    ],
    [
      "a latitude that is not a number",
      { ...BIRTH, lat: "north" },
      "lat and lon must be numbers, got 'north' and 0",
    ],
    [
      "a latitude beyond the pole",
      { ...BIRTH, lat: 91 },
      "lat must be within -90.0..90.0, got 91",
    ],
    [
      "a longitude beyond the date line",
      { ...BIRTH, lon: -181 },
      "lon must be within -180.0..180.0, got -181",
    ],
  ])("refuses %s with the Python SDK's words", (_case, fields, message) => {
    expect(() => RequestBodies.birth("natal", fields)).toThrow(ValidationError);
    expect(() => RequestBodies.birth("natal", fields)).toThrow(message);
  });

  it.each(["date", "lat", "lon"])("refuses a birth without %s", (missing) => {
    const fields = Object.fromEntries(
      Object.entries(BIRTH).filter(([name]) => name !== missing),
    );

    expect(() => RequestBodies.birth("natal", fields)).toThrow(TypeError);
    expect(() => RequestBodies.birth("natal", fields)).toThrow(
      `natal() missing the birth field '${missing}'`,
    );
  });

  it("refuses a field the birth does not hold", () => {
    expect(() =>
      RequestBodies.birth("natal", { ...BIRTH, place: "London" }),
    ).toThrow("natal() got an unexpected field 'place'");
  });

  it("counts a field set to undefined or null as not given", () => {
    expect(
      RequestBodies.birth("natal", {
        ...BIRTH,
        time: undefined,
        timezone: null,
      }),
    ).toEqual(BIRTH);
  });
});

describe("RequestBodies.chart", () => {
  it("builds birth and options, as the Python example shows", () => {
    expect(
      RequestBodies.chart(
        "natal",
        { date: "2000-01-01", lat: 0, lon: 0 },
        { options: { wheel: true } },
        false,
      ).json,
    ).toEqual({
      birth: { date: "2000-01-01", lat: 0, lon: 0 },
      options: { wheel: true },
    });
  });

  it("takes the output and the signal out of the fields, for a document", () => {
    const controller = new AbortController();

    const call = RequestBodies.chart(
      "renderPng",
      { ...BIRTH, output: "wheel.png", signal: controller.signal },
      undefined,
      true,
    );

    expect(call.json).toEqual({ birth: BIRTH });
    expect(call.output).toBe("wheel.png");
    expect(call.signal).toBe(controller.signal);
  });

  it("refuses output on a method that answers with data", () => {
    expect(() =>
      RequestBodies.chart(
        "natal",
        { ...BIRTH, output: "chart.json" },
        undefined,
        false,
      ),
    ).toThrow("natal() got an unexpected field 'output'");
  });

  it("refuses a birth field in the second object", () => {
    expect(() =>
      RequestBodies.chart("natal", BIRTH, { date: "2001-01-01" }, false),
    ).toThrow("natal() got an unexpected field 'date'");
  });

  it("refuses options given in both objects", () => {
    expect(() =>
      RequestBodies.chart(
        "natal",
        { ...BIRTH, options: {} },
        { options: {} },
        false,
      ),
    ).toThrow("natal() got multiple values for 'options'");
  });

  it("refuses options that are not an object", () => {
    expect(() =>
      RequestBodies.chart("natal", BIRTH, { options: ["wheel"] }, false),
    ).toThrow(TypeError);
  });

  it("refuses fields that are not an object", () => {
    expect(() =>
      // @ts-expect-error -- a caller without type checks can pass a list
      RequestBodies.chart("natal", [], undefined, false),
    ).toThrow("natal() takes its fields as an object, got array");
  });
});

describe("RequestBodies.pair", () => {
  it("names the second chart partner, with the options and further fields", () => {
    expect(
      RequestBodies.pair(
        "synastry",
        BIRTH,
        BIRTH,
        { options: { orb: 2 }, lang: "tr", empty: undefined },
        false,
      ).json,
    ).toEqual({
      birth: BIRTH,
      partner: BIRTH,
      options: { orb: 2 },
      lang: "tr",
    });
  });

  it("checks both people's births", () => {
    expect(() =>
      RequestBodies.pair(
        "synastry",
        BIRTH,
        { ...BIRTH, lat: 100 },
        undefined,
        false,
      ),
    ).toThrow(ValidationError);
  });
});

describe("RequestBodies.body", () => {
  it("sends a body as given, without checking its birth", () => {
    expect(
      RequestBodies.body(
        "query",
        { birth: { date: "2000-01-01" }, sql: "SELECT 1" },
        undefined,
        false,
      ).json,
    ).toEqual({ birth: { date: "2000-01-01" }, sql: "SELECT 1" });
  });

  it("takes output apart from a document's body", () => {
    const call = RequestBodies.body(
      "exportReport",
      { birth: BIRTH },
      { output: "report.pdf" },
      true,
    );

    expect(call.json).toEqual({ birth: BIRTH });
    expect(call.output).toBe("report.pdf");
  });

  it("refuses a value JSON cannot carry", () => {
    expect(() =>
      RequestBodies.body("batch", { items: [() => 1] }, undefined, false),
    ).toThrow(TypeError);
  });
});

describe("RequestBodies.params", () => {
  it("leaves out the parameters set to undefined or null, as Python leaves out None", () => {
    expect(
      RequestBodies.params("eclipses", {
        year: 2027,
        lang: undefined,
        month: null,
      }).params,
    ).toEqual({ year: 2027 });
  });

  it("refuses a parameter that is not text, a number, or a boolean", () => {
    expect(() => RequestBodies.params("eclipses", { year: [2027] })).toThrow(
      TypeError,
    );
  });
});

describe("RequestBodies.sharecard", () => {
  it("builds a natal card from one chart's fields passed flat, as the Python example shows", () => {
    expect(
      RequestBodies.sharecard(null, null, {
        type: "natal",
        name: "Ada",
        date: "2000-01-01",
        lat: 0,
        lon: 0,
      }).json,
    ).toEqual({
      birth: { date: "2000-01-01", lat: 0, lon: 0 },
      type: "natal",
      names: ["Ada"],
    });
  });

  it("builds a synastry card from two charts, the default type", () => {
    expect(
      RequestBodies.sharecard(BIRTH, BIRTH, {
        names: ["Ada", "Alan"],
        lang: "en",
      }).json,
    ).toEqual({
      birth: BIRTH,
      type: "synastry",
      partner: BIRTH,
      names: ["Ada", "Alan"],
      lang: "en",
    });
  });

  it("refuses name and names together", () => {
    expect(() =>
      RequestBodies.sharecard(BIRTH, null, { name: "Ada", names: ["Ada"] }),
    ).toThrow("pass either name or names, not both");
  });
});
