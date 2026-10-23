// PATH: tests/tools/generate/operations.test.ts

/**
 * GENERATOR OPERATIONS TESTS: how each operation becomes a method
 *
 * Purpose:
 *   The names, the arguments, the request shape, and the wrapper flag, each
 *   decided as the Python SDK's generator decides it.
 */

import { describe, expect, it } from "vitest";
import {
  GeneratorError,
  readOpenApi,
} from "../../../tools/generate/openApi.ts";
import {
  answerReach,
  camelName,
  methodReach,
  pascalName,
  sdkOperations,
  tableSummaryOf,
  type SdkOperation,
} from "../../../tools/generate/operations.ts";
import { ShapeCatalog } from "../../../tools/generate/shapes.ts";
import { answering, ref, snapshot, type Members } from "./snapshots.ts";

/**
 * Turn a snapshot's paths and components into methods.
 *
 * @param paths - The paths member.
 * @param schemas - The component schemas.
 * @returns The methods and the catalog of the components.
 */
function methodsOf(
  paths: Members,
  schemas: Members = {},
): {
  readonly methods: readonly SdkOperation[];
  readonly catalog: ShapeCatalog;
} {
  const document = readOpenApi(snapshot(paths, schemas));
  const catalog = new ShapeCatalog(document.components);
  return { methods: sdkOperations(document, catalog), catalog };
}

/**
 * Turn one operation answering with a schema into its method.
 *
 * @param answer - The success's schema.
 * @param schemas - The component schemas.
 * @returns The method.
 */
function methodAnswering(answer: Members, schemas: Members = {}): SdkOperation {
  const [method] = methodsOf(
    { "/v1/natal": answering("post", "natal", answer) },
    schemas,
  ).methods;
  if (method === undefined) {
    throw new Error("the snapshot holds one operation");
  }
  return method;
}

/**
 * Turn one POST taking a body of the given fields into its method.
 *
 * @param fields - The body's properties.
 * @param required - The body's required fields.
 * @returns The method.
 */
function methodTaking(
  fields: Members,
  required: readonly string[] = [],
): SdkOperation {
  const [method] = methodsOf(
    {
      "/v1/natal": answering(
        "post",
        "natal",
        {},
        {
          requestBody: {
            required: true,
            content: { "application/json": { schema: ref("Body") } },
          },
        },
      ),
    },
    { Body: { type: "object", properties: fields, required } },
  ).methods;
  if (method === undefined) {
    throw new Error("the snapshot holds one operation");
  }
  return method;
}

describe("camelName and pascalName", () => {
  it.each([
    ["natal", "natal", "Natal"],
    ["search_places", "searchPlaces", "SearchPlaces"],
    ["moon_phases_for", "moonPhasesFor", "MoonPhasesFor"],
  ])("write %s as %s and %s", (snake, camel, pascal) => {
    expect(camelName(snake)).toBe(camel);
    expect(pascalName(snake)).toBe(pascal);
  });

  it.each(["Natal", "searchPlaces", "_natal", "natal__chart", ""])(
    "refuse %j, which is not snake_case",
    (name) => {
      expect(() => camelName(name)).toThrow(GeneratorError);
    },
  );
});

describe("tableSummaryOf, as the Python SDK trims a summary", () => {
  it.each<[Members, string]>([
    [{ summary: "Compute a natal chart." }, "Compute a natal chart"],
    [{}, "Call the endpoint"],
    [{ description: "First line.\nSecond line." }, "First line"],
    [{ summary: "  Spaced \t out  " }, "Spaced out"],
  ])("trims %j to %j", (operation, expected) => {
    expect(tableSummaryOf(operation)).toBe(expected);
  });

  it("cuts a long summary at a word within 58 characters, with an ellipsis", () => {
    const summary = tableSummaryOf({
      summary:
        "Eclipses, retrogrades, planetary hours, and void Moon periods for a whole year",
    });

    expect(summary).toBe(
      "Eclipses, retrogrades, planetary hours, and void Moon…",
    );
    expect(summary.length).toBeLessThanOrEqual(59);
  });
});

describe("sdkOperations", () => {
  it("keeps the operation id, the Python SDK's method name", () => {
    expect(methodAnswering({}).operationId).toBe("natal");
  });

  it("takes a path placeholder as an argument in camelCase", () => {
    const [method] = methodsOf({
      "/v1/jobs/{job_id}": answering(
        "get",
        "job",
        {},
        {
          parameters: [
            { name: "job_id", in: "path", required: true, schema: {} },
          ],
        },
      ),
    }).methods;
    expect(method?.pathArguments).toEqual([
      { placeholder: "job_id", argument: "jobId", description: undefined },
    ]);
    expect(method?.kind).toBe("get");
    expect(method?.fields).toEqual(["job_id"]);
  });

  it("takes the query as one argument, required when a parameter is", () => {
    const [method] = methodsOf({
      "/v1/geo/search": answering(
        "get",
        "search_places",
        {},
        {
          parameters: [
            { name: "q", in: "query", required: true, schema: {} },
            { name: "limit", in: "query", schema: {} },
          ],
        },
      ),
    }).methods;
    expect(method?.query?.typeName).toBe("SearchPlacesQuery");
    expect(method?.query?.required).toBe(true);
    expect(
      method?.query?.parameters.map((parameter) => parameter.name),
    ).toEqual(["q", "limit"]);
  });

  it("takes the body of its component, with its fields in order", () => {
    const method = methodTaking({ birth: {}, options: {} });
    expect(method.body).toMatchObject({
      typeName: "Body",
      required: true,
      fields: ["birth", "options"],
    });
  });

  it.each<[string, Members, readonly string[], string]>([
    [
      "a body that requires a partner",
      { birth: {}, partner: {}, options: {} },
      ["birth", "partner"],
      "pair",
    ],
    [
      "a body of birth and options",
      { birth: {}, options: {} },
      ["birth"],
      "chart",
    ],
    ["a body of birth alone", { birth: {} }, ["birth"], "chart"],
    [
      "a body that only allows a partner",
      { birth: {}, partner: {}, sql: {} },
      ["birth"],
      "birth_extra",
    ],
    [
      "a body of birth and other fields",
      { birth: {}, name: {} },
      ["birth"],
      "birth_extra",
    ],
    ["a body without a birth", { items: {} }, ["items"], "body"],
  ])(
    "gives %s the shape the Python SDK gives it",
    (_case, fields, required, kind) => {
      expect(methodTaking(fields, required).kind).toBe(kind);
    },
  );

  it("reads a POST without a body as empty", () => {
    expect(methodAnswering({}).kind).toBe("empty");
  });

  it("reads a DELETE as delete, with its parameters as its fields", () => {
    const [method] = methodsOf({
      "/v1/custom-body/{name}": answering(
        "delete",
        "delete_custom_body",
        {},
        {
          parameters: [
            { name: "name", in: "path", required: true, schema: {} },
          ],
        },
      ),
    }).methods;
    expect(method?.kind).toBe("delete");
    expect(method?.fields).toEqual(["name"]);
  });

  it("marks the share card as written by hand, and no other", () => {
    const { methods } = methodsOf({
      "/v1/render/sharecard": answering("post", "render_sharecard", {}),
      "/v1/render/png": answering("post", "render_png", {}),
    });
    expect(
      methods.map((method) => [method.methodName, method.handWritten]),
    ).toEqual([
      ["renderPng", false],
      ["renderSharecard", true],
    ]);
  });

  it("checks an answer of a component with the component's own check", () => {
    const method = methodAnswering(ref("NatalResponse"), {
      NatalResponse: { type: "object", properties: { aspects: {} } },
    });
    expect(method.answer).toMatchObject({
      kind: "json",
      typeName: "NatalResponse",
      check: { name: "isNatalResponse", generated: true },
    });
    expect(method.enveloped).toBe(false);
  });

  it("marks a wrapper whose fields are exactly technique and result", () => {
    const method = methodAnswering(ref("TechniqueEnvelope"), {
      TechniqueEnvelope: {
        type: "object",
        properties: { technique: { type: "string" }, result: {} },
      },
    });
    expect(method.enveloped).toBe(true);
    expect(method.answer).toMatchObject({ kind: "json", resultAnyJson: true });
  });

  it("never marks a status that owns a result beside its other members", () => {
    const method = methodAnswering(ref("JobStatusResponse"), {
      JobStatusResponse: {
        type: "object",
        properties: {
          state: { type: "string" },
          technique: { type: "string" },
          result: {},
        },
      },
    });
    expect(method.enveloped).toBe(false);
  });

  it.each<[string, Members]>([
    ["any JSON value", {}],
    ["any JSON object", { type: "object", additionalProperties: true }],
  ])("leaves the wrapper of %s to the body", (_case, answer) => {
    expect(methodAnswering(answer).enveloped).toBeUndefined();
  });

  it("leaves the wrapper to the body when no 200 answer is published", () => {
    const [method] = methodsOf(
      {
        "/v1/jobs": {
          post: {
            operationId: "submit_job",
            responses: {
              "202": {
                description: "Accepted",
                content: { "application/json": { schema: ref("Accepted") } },
              },
            },
          },
        },
      },
      { Accepted: { type: "object", properties: { id: {} } } },
    ).methods;
    expect(method?.enveloped).toBeUndefined();
  });

  it.each<[string, Members, string, string, boolean]>([
    ["any JSON value", {}, "JsonValue", "isJsonValue", true],
    [
      "any JSON object",
      { type: "object", additionalProperties: true },
      "JsonObject",
      "isJsonObject",
      false,
    ],
  ])(
    "reads an answer of %s with the client's own check",
    (_case, answer, typeName, check, anyJson) => {
      expect(methodAnswering(answer).answer).toMatchObject({
        kind: "json",
        typeName,
        check: { name: check, generated: false },
        anyJson,
      });
    },
  );

  it("names an answer written for one method alone after the method", () => {
    const method = methodAnswering({
      type: "array",
      items: { type: "string" },
    });
    expect(method.answer).toMatchObject({
      typeName: "NatalAnswer",
      check: { name: "isNatalAnswer", generated: true },
    });
  });

  it("reads a success without JSON as a document", () => {
    const [method] = methodsOf({
      "/v1/render/png": {
        post: {
          operationId: "render_png",
          responses: {
            "200": { description: "PNG", content: { "image/png": {} } },
          },
        },
      },
    }).methods;
    expect(method?.answer).toEqual({
      kind: "document",
      mediaTypes: ["image/png"],
    });
    expect(method?.enveloped).toBeUndefined();
  });

  it("reads the lowest success status", () => {
    const [method] = methodsOf({
      "/v1/jobs": {
        post: {
          operationId: "submit_job",
          responses: {
            "422": { description: "Refused" },
            "202": {
              description: "Accepted",
              content: { "application/json": { schema: {} } },
            },
          },
        },
      },
    }).methods;
    expect(method?.answer.kind).toBe("json");
  });

  it("sorts the methods by name", () => {
    const { methods } = methodsOf({
      "/v1/transits": answering("post", "transits", {}),
      "/v1/natal": answering("post", "natal", {}),
      "/v1/eclipses": answering("get", "eclipses", {}),
    });
    expect(methods.map((method) => method.methodName)).toEqual([
      "eclipses",
      "natal",
      "transits",
    ]);
  });

  it.each<[string, Members, Members, string]>([
    [
      "two operations of one method name",
      {
        "/v1/natal": answering("post", "natal", {}),
        "/v1/natal-again": answering("post", "natal", {}),
      },
      {},
      "both be the method natal",
    ],
    [
      "a method name the client keeps for itself",
      { "/v1/request": answering("post", "request", {}) },
      {},
      "a name the client keeps for itself",
    ],
    [
      "the catalog walk's name",
      { "/v1/bodies": answering("post", "bodies", {}) },
      {},
      "a name the client keeps for itself",
    ],
    [
      "a GET with a body",
      {
        "/v1/natal": answering(
          "get",
          "natal",
          {},
          {
            requestBody: {
              content: { "application/json": { schema: ref("Body") } },
            },
          },
        ),
      },
      { Body: { type: "object", properties: {} } },
      "a GET request never carries",
    ],
    [
      "a body no component types",
      {
        "/v1/natal": answering(
          "post",
          "natal",
          {},
          {
            requestBody: {
              content: { "application/json": { schema: { type: "object" } } },
            },
          },
        ),
      },
      {},
      "a body other than one JSON body",
    ],
    [
      "a placeholder without its parameter",
      { "/v1/jobs/{job_id}": answering("get", "job", {}) },
      {},
      "holds {job_id} in its path without a parameter",
    ],
    [
      "a success without a body",
      {
        "/v1/natal": {
          post: {
            operationId: "natal",
            responses: { "204": { description: "No Content" } },
          },
        },
      },
      {},
      "answers its success without a body",
    ],
  ])("refuses %s", (_case, paths, schemas, message) => {
    expect(() => methodsOf(paths, schemas)).toThrow(message);
  });
});

describe("methodReach and answerReach", () => {
  const { methods, catalog } = methodsOf(
    {
      "/v1/natal": {
        post: {
          operationId: "natal",
          requestBody: {
            content: { "application/json": { schema: ref("NatalApiRequest") } },
          },
          responses: {
            "200": {
              description: "Successful Response",
              content: { "application/json": { schema: ref("NatalResponse") } },
            },
            "422": {
              description: "Validation Error",
              content: {
                "application/json": { schema: ref("HTTPValidationError") },
              },
            },
          },
        },
      },
    },
    {
      NatalApiRequest: {
        type: "object",
        properties: { birth: ref("BirthPayload") },
      },
      BirthPayload: {
        type: "object",
        properties: { date: { type: "string" } },
      },
      NatalResponse: {
        type: "object",
        properties: { aspects: ref("AspectRow") },
      },
      AspectRow: { type: "object", properties: { orb: { type: "number" } } },
      HTTPValidationError: { type: "object", properties: {} },
    },
  );

  it("names what a method sends or receives, and no error answer's component", () => {
    expect([...methodReach(methods, catalog)].sort()).toEqual([
      "AspectRow",
      "BirthPayload",
      "NatalApiRequest",
      "NatalResponse",
    ]);
  });

  it("names what an answer reaches, at any depth", () => {
    expect([...answerReach(methods, catalog)].sort()).toEqual([
      "AspectRow",
      "NatalResponse",
    ]);
  });
});
