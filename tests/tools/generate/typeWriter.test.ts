// PATH: tests/tools/generate/typeWriter.test.ts

/**
 * GENERATOR TYPE TESTS: the shapes written for requests and for answers
 */

import { describe, expect, it } from "vitest";
import { readOpenApi } from "../../../tools/generate/openApi.ts";
import {
  answerReach,
  methodReach,
  sdkOperations,
} from "../../../tools/generate/operations.ts";
import { ShapeCatalog } from "../../../tools/generate/shapes.ts";
import { renderSchemaTypes } from "../../../tools/generate/typeWriter.ts";
import { answering, ref, snapshot, type Members } from "./snapshots.ts";

/**
 * Write the types of one POST operation that sends Request and answers with Answer.
 *
 * @param schemas - The component schemas, Request and Answer among them.
 * @returns The types module's text, before formatting.
 */
function typesOf(schemas: Members): string {
  const document = readOpenApi(
    snapshot(
      {
        "/v1/natal": answering("post", "natal", ref("Answer"), {
          requestBody: {
            content: { "application/json": { schema: ref("Request") } },
          },
        }),
      },
      schemas,
    ),
  );
  const catalog = new ShapeCatalog(document.components);
  const methods = sdkOperations(document, catalog);
  return renderSchemaTypes(
    methods,
    catalog,
    methodReach(methods, catalog),
    answerReach(methods, catalog),
  );
}

/** A request and an answer that both hold a member of each kind under test. */
const SHAPES = {
  Request: {
    type: "object",
    properties: {
      state: ref("JobState"),
      finished: { anyOf: [{ type: "string" }, { type: "null" }] },
    },
    required: ["state", "finished"],
  },
  Answer: {
    type: "object",
    properties: {
      state: ref("JobState"),
      finished: { anyOf: [{ type: "string" }, { type: "null" }] },
      "wheel-size": { type: "number" },
      created_at: { type: "string" },
      $mark: { type: "string" },
      "2nd": { type: "string" },
    },
    required: ["state", "finished"],
  },
  JobState: { type: "string", enum: ["queued", "done"] },
} as const;

describe("renderSchemaTypes", () => {
  const types = typesOf(SHAPES);

  it("writes a closed set as the union of its values", () => {
    expect(types).toContain('export type JobState = "queued" | "done";');
  });

  it("opens a closed set inside an answer, and keeps it exact inside a request", () => {
    expect(types).toMatch(/Answer = Readonly<\{[^}]*state: OpenSet<JobState>;/);
    expect(types).toMatch(/Request = Readonly<\{[^}]*state: JobState;/);
  });

  it("lets a required member that names null go missing in an answer only", () => {
    expect(types).toMatch(
      /Answer = Readonly<\{[^}]*finished\?: string \| null;/,
    );
    expect(types).toMatch(
      /Request = Readonly<\{[^}]*finished: string \| null;/,
    );
  });

  it.each([
    ['"wheel-size"?: number;', "a name with a hyphen"],
    ['"2nd"?: string;', "a name that begins with a digit"],
    ["created_at?: string;", "an identifier with an underscore"],
    ["$mark?: string;", "an identifier with a dollar sign"],
  ])("writes %s for %s", (line) => {
    expect(types).toContain(line);
  });

  it("imports the JSON types it uses", () => {
    expect(types).toContain(
      'import type { OpenSet } from "../records/json.ts";',
    );
  });

  it("writes a method's query as its own type", () => {
    const document = readOpenApi(
      snapshot({
        "/v1/geo/search": answering(
          "get",
          "search_places",
          {},
          {
            parameters: [
              {
                name: "q",
                in: "query",
                required: true,
                schema: { type: "string" },
              },
              { name: "limit", in: "query", schema: { type: "integer" } },
            ],
          },
        ),
      }),
    );
    const catalog = new ShapeCatalog(document.components);
    const methods = sdkOperations(document, catalog);
    const text = renderSchemaTypes(
      methods,
      catalog,
      methodReach(methods, catalog),
      answerReach(methods, catalog),
    );
    expect(text).toContain("export type SearchPlacesQuery = Readonly<{");
    expect(text).toContain("q: string;");
    expect(text).toContain("limit?: number;");
  });

  it.each<[string, Members, string]>([
    [
      "a type named as the package's own error",
      {
        Request: {
          type: "object",
          properties: { reason: ref("ValidationError") },
        },
        Answer: { type: "object", properties: {} },
        ValidationError: { type: "object", properties: {} },
      },
      "named ValidationError, which the package already exports",
    ],
    [
      "members beside a schema for the other members",
      {
        Request: {
          type: "object",
          properties: { a: { type: "string" } },
          additionalProperties: { type: "string" },
        },
        Answer: { type: "object", properties: {} },
      },
      "lists members and a schema for its other members",
    ],
  ])("refuses %s", (_case, schemas, message) => {
    expect(() => typesOf(schemas)).toThrow(message);
  });
});
