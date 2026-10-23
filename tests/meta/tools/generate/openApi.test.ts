// PATH: tests/meta/tools/generate/openApi.test.ts

/**
 * GENERATOR READER TESTS: the snapshot, read member by member, and what it refuses
 */

import { describe, expect, it } from "vitest";
import {
  GeneratorError,
  readOpenApi,
} from "../../../../.meta/tools/generate/openApi.ts";
import { answering, snapshot } from "./snapshots.ts";

describe("readOpenApi", () => {
  it("reads an operation with its body and its answers", () => {
    const document = readOpenApi(
      snapshot(
        {
          "/v1/natal": {
            post: {
              operationId: "natal",
              summary: "Free natal chart",
              requestBody: {
                required: true,
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/NatalApiRequest" },
                  },
                },
              },
              responses: {
                "200": {
                  description: "Successful Response",
                  content: { "image/png": {} },
                },
                "422": { description: "Validation Error" },
              },
              tags: ["Natal"],
            },
          },
        },
        { NatalApiRequest: { type: "object" } },
      ),
    );
    const [operation] = document.operations;
    expect(operation).toMatchObject({
      verb: "post",
      path: "/v1/natal",
      operationId: "natal",
      summary: "Free natal chart",
      requestBody: { required: true },
    });
    expect(operation?.requestBody?.contents[0]?.schema?.ref).toBe(
      "NatalApiRequest",
    );
    expect(operation?.responses.map((response) => response.status)).toEqual([
      "200",
      "422",
    ]);
    expect(operation?.responses[0]?.contents).toEqual([
      { mediaType: "image/png", schema: undefined },
    ]);
    expect(operation?.responses[1]?.contents).toEqual([]);
  });

  it("reads a query parameter", () => {
    const document = readOpenApi(
      snapshot({
        "/v1/eclipses": {
          get: {
            operationId: "eclipses",
            parameters: [
              {
                name: "year",
                in: "query",
                required: true,
                schema: { type: "integer", minimum: 1800 },
              },
            ],
            responses: {},
          },
        },
      }),
    );
    expect(document.operations[0]?.parameters[0]).toMatchObject({
      name: "year",
      location: "query",
      required: true,
    });
  });

  it("reads members in order, each with whether it is required", () => {
    const document = readOpenApi(
      snapshot(
        {},
        {
          BirthPayload: {
            type: "object",
            properties: { date: { type: "string" }, time: { type: "string" } },
            required: ["date"],
          },
        },
      ),
    );
    expect(
      document.components
        .get("BirthPayload")
        ?.properties?.map(({ name, required }) => [name, required]),
    ).toEqual([
      ["date", true],
      ["time", false],
    ]);
  });

  it("keeps a const of null apart from no const", () => {
    const document = readOpenApi(
      snapshot({}, { Nothing: { const: null }, Text: { type: "string" } }),
    );
    expect(document.components.get("Nothing")?.constValue).toEqual({
      value: null,
    });
    expect(document.components.get("Text")?.constValue).toBeUndefined();
  });

  it("keeps the limits as JSON text, in the order of its keywords", () => {
    const document = readOpenApi(
      snapshot(
        {},
        { Latitude: { type: "number", maximum: 90, minimum: -90, default: 0 } },
      ),
    );
    expect(document.components.get("Latitude")?.limits).toEqual([
      { keyword: "minimum", json: "-90" },
      { keyword: "maximum", json: "90" },
      { keyword: "default", json: "0" },
    ]);
  });

  it("passes over an extension member", () => {
    const document = readOpenApi(
      snapshot({}, { Theme: { type: "string", "x-origin": "settings" } }),
    );
    expect(document.components.get("Theme")?.type).toBe("string");
  });

  it.each<[string, string, string]>([
    [
      "a keyword it cannot write",
      snapshot({}, { Pick: { oneOf: [{ type: "string" }] } }),
      "#/components/schemas/Pick uses the keyword oneOf",
    ],
    [
      "a reference outside the components",
      snapshot({}, { Pick: { $ref: "#/definitions/Other" } }),
      "points to #/definitions/Other",
    ],
    [
      "a list of types",
      snapshot({}, { Pick: { type: ["string", "null"] } }),
      "#/components/schemas/Pick/type must be a text",
    ],
    [
      "a required member it does not list",
      snapshot(
        {},
        {
          Pick: {
            type: "object",
            properties: { a: {} },
            required: ["b"],
          },
        },
      ),
      "requires b, which it does not list",
    ],
    [
      "a parameter sent in a header",
      snapshot({
        "/v1/natal": {
          get: {
            operationId: "natal",
            parameters: [{ name: "x", in: "header", schema: {} }],
            responses: {},
          },
        },
      }),
      "#/paths/~1v1~1natal/get/parameters/0/in is header",
    ],
    [
      "a method the client does not send",
      snapshot({
        "/v1/natal": { put: answering("post", "natal", {})["post"] },
      }),
      "#/paths/~1v1~1natal holds the member put",
    ],
    ["text that is not JSON", "{not json", "the snapshot is not JSON"],
  ])("refuses %s, naming its place", (_case, text, message) => {
    expect(() => readOpenApi(text)).toThrow(GeneratorError);
    expect(() => readOpenApi(text)).toThrow(message);
  });
});
