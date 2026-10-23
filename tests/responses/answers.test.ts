// PATH: tests/responses/answers.test.ts

/**
 * ANSWER TESTS: what a named method returns, and the error of an answer outside its shape
 */

import { describe, expect, it } from "vitest";
import { CLIENT_ERROR_CODES } from "../../src/models/constants/errors.ts";
import { AstroMansionError } from "../../src/models/errors/api.ts";
import type { JsonObject, JsonValue } from "../../src/models/records/json.ts";
import { readDocument, readJson } from "../../src/responses/answers.ts";
import { isJsonObject } from "../../src/responses/json.ts";

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

describe("readJson", () => {
  it("returns an answer that passes its shape's check", () => {
    const answer: JsonObject = { results: [] };
    expect(readJson(answer, isJsonObject, "searchPlaces")).toBe(answer);
  });

  it("refuses an answer of another shape, keeping it as the details", () => {
    const failure = failureOf(() =>
      readJson(["Leo"], isJsonObject, "searchPlaces"),
    );
    expect(failure.errorCode).toBe(CLIENT_ERROR_CODES.UNEXPECTED_ANSWER);
    expect(failure.details).toEqual(["Leo"]);
    expect(failure.message).toContain("the answer to searchPlaces");
  });

  it("refuses a document where JSON is published", () => {
    const failure = failureOf(() =>
      readJson(new Uint8Array([1, 2]), isJsonObject, "natal"),
    );
    expect(failure.errorCode).toBe(CLIENT_ERROR_CODES.UNEXPECTED_ANSWER);
    expect(failure.details).toBeUndefined();
  });
});

describe("readDocument", () => {
  it("returns a document's bytes as they arrived", () => {
    const bytes = new Uint8Array([137, 80, 78, 71]);
    expect(readDocument(bytes, "renderPng")).toBe(bytes);
  });

  it("returns a text document's UTF-8 bytes", () => {
    expect(
      new TextDecoder().decode(readDocument("Güneş Aslan", "exportCsv")),
    ).toBe("Güneş Aslan");
  });

  it.each<JsonValue>([{ error: "none" }, 7, null])(
    "refuses JSON where a document is published, such as %j",
    (answer) => {
      const failure = failureOf(() => readDocument(answer, "renderPng"));
      expect(failure.errorCode).toBe(CLIENT_ERROR_CODES.UNEXPECTED_ANSWER);
      expect(failure.details).toEqual(answer);
    },
  );
});
