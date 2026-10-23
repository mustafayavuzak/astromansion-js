// PATH: tests/responses/answers.test.ts

/**
 * ANSWER TESTS: what a named method returns, and the error of an answer outside its shape
 */

import { describe, expect, it } from "vitest";
import { CLIENT_ERROR_CODES } from "../../src/models/constants/errors.ts";
import { AstroMansionError } from "../../src/models/errors/api.ts";
import type { JsonValue } from "../../src/models/records/json.ts";
import { Result } from "../../src/response.ts";
import {
  readAnyJson,
  readDocument,
  readFreeForm,
  readResult,
  readWrapped,
} from "../../src/responses/answers.ts";
import { isJsonObject } from "../../src/responses/json.ts";

/** A wrapper's shape, as a generated check would type it. */
type Wrapper = Readonly<{ technique: string; result: JsonValue }>;

/**
 * Tell whether a value is the wrapper, as a generated check would.
 *
 * @param value - The body.
 * @returns True for an object with a text technique and a result.
 */
function isWrapper(value: JsonValue): value is Wrapper {
  return (
    isJsonObject(value) &&
    typeof value["technique"] === "string" &&
    value["result"] !== undefined
  );
}

/**
 * Catch the failure of a call, for its fields.
 *
 * @param call - The call expected to throw.
 * @returns The error it threw.
 */
function failureOf(call: () => unknown): AstroMansionError {
  try {
    call();
  } catch (error) {
    if (error instanceof AstroMansionError) {
      return error;
    }
    throw error;
  }
  throw new Error("the call returned where it should have thrown");
}

describe("readResult", () => {
  it("returns the Result of a body that has its shape", () => {
    const answer = Result.build({ results: [] }, "searchPlaces", false);

    expect(readResult(answer, isJsonObject, "searchPlaces")).toBe(answer);
  });

  it("refuses a body of another shape, keeping it as the details", () => {
    const failure = failureOf(() =>
      readResult(Result.build(["Leo"]), isJsonObject, "searchPlaces"),
    );

    expect(failure.errorCode).toBe(CLIENT_ERROR_CODES.UNEXPECTED_ANSWER);
    expect(failure.details).toEqual(["Leo"]);
  });

  it.each([
    ["a document", new Uint8Array([1, 2])],
    ["text", "Saturn Taurus"],
  ])("refuses %s where the API publishes JSON", (_case, answer) => {
    const failure = failureOf(() => readResult(answer, isJsonObject, "natal"));

    expect(failure.errorCode).toBe(CLIENT_ERROR_CODES.UNEXPECTED_ANSWER);
    expect(failure.details).toBeUndefined();
  });
});

describe("readWrapped", () => {
  it("returns the Result whose data is the wrapper's result", () => {
    const answer = Result.build(
      { technique: "transits", result: [1, 2] },
      "transits",
      true,
    );

    const read = readWrapped(answer, isWrapper, "transits");

    expect(read.data).toEqual([1, 2]);
    expect(read.technique).toBe("transits");
  });

  it("refuses a body that is not the wrapper", () => {
    const failure = failureOf(() =>
      readWrapped(Result.build({ hits: [] }), isWrapper, "transits"),
    );

    expect(failure.errorCode).toBe(CLIENT_ERROR_CODES.UNEXPECTED_ANSWER);
    expect(failure.details).toEqual({ hits: [] });
  });
});

describe("readFreeForm", () => {
  it("returns the Result of a body of the published kind", () => {
    const answer = Result.build({ technique: "chart", result: { bodies: {} } });

    expect(readFreeForm(answer, isJsonObject, "chart").data).toEqual({
      bodies: {},
    });
  });

  it("refuses a body of another kind", () => {
    const failure = failureOf(() =>
      readFreeForm(Result.build([]), isJsonObject, "chart"),
    );

    expect(failure.errorCode).toBe(CLIENT_ERROR_CODES.UNEXPECTED_ANSWER);
  });
});

describe("readAnyJson", () => {
  it("returns a Result as it is", () => {
    const answer = Result.build([{ name: "Sun" }]);

    expect(readAnyJson(answer, "query")).toBe(answer);
  });

  it("returns the text of a rendered answer", () => {
    expect(readAnyJson("┌──────┐", "query")).toBe("┌──────┐");
  });

  it("refuses a document where the API publishes JSON", () => {
    const failure = failureOf(() => readAnyJson(new Uint8Array([1]), "query"));

    expect(failure.errorCode).toBe(CLIENT_ERROR_CODES.UNEXPECTED_ANSWER);
  });
});

describe("readDocument", () => {
  it("returns a document's bytes as they arrived", () => {
    const png = new Uint8Array([137, 80, 78, 71]);

    expect(readDocument(png, "renderPng")).toBe(png);
  });

  it("returns a text/plain document as its text, as Python's client does", () => {
    expect(readDocument("Sun Leo", "exportCsv")).toBe("Sun Leo");
  });

  it("refuses JSON where the API publishes a document, keeping it as the details", () => {
    const answer = Result.build({ error: "no" });

    const failure = failureOf(() => readDocument(answer, "renderPng"));

    expect(failure.errorCode).toBe(CLIENT_ERROR_CODES.UNEXPECTED_ANSWER);
    expect(failure.details).toEqual({ error: "no" });
  });
});
