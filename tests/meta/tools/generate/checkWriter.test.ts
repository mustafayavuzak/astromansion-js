// PATH: tests/meta/tools/generate/checkWriter.test.ts

/**
 * GENERATOR CHECK TESTS: the tests an answer's check is written from
 */

import { describe, expect, it } from "vitest";
import { renderAnswerChecks } from "../../../../.meta/tools/generate/checkWriter.ts";
import { readOpenApi } from "../../../../.meta/tools/generate/openApi.ts";
import {
  answerReach,
  sdkOperations,
} from "../../../../.meta/tools/generate/operations.ts";
import { ShapeCatalog } from "../../../../.meta/tools/generate/shapes.ts";
import { answering, ref, snapshot, type Members } from "./snapshots.ts";

/**
 * Write the checks of one operation that answers with Answer.
 *
 * @param schemas - The component schemas, Answer among them.
 * @returns The checks module's text, before formatting.
 */
function checksOf(schemas: Members): string {
  const document = readOpenApi(
    snapshot({ "/v1/job": answering("get", "job", ref("Answer")) }, schemas),
  );
  const catalog = new ShapeCatalog(document.components);
  const methods = sdkOperations(document, catalog);
  return renderAnswerChecks(methods, catalog, answerReach(methods, catalog));
}

describe("renderAnswerChecks", () => {
  const checks = checksOf({
    Answer: {
      type: "object",
      properties: {
        id: { type: "string" },
        count: { type: "integer" },
        state: ref("JobState"),
        result: {},
        note: { type: "string" },
        finished: { anyOf: [{ type: "string" }, { type: "null" }] },
        items: {
          type: "array",
          items: { anyOf: [ref("Answered"), ref("Refused")] },
        },
        error: { type: "object", additionalProperties: { type: "string" } },
      },
      required: ["id", "count", "state", "result", "finished", "items"],
    },
    Answered: {
      type: "object",
      properties: { ok: { type: "boolean", const: true } },
      required: ["ok"],
    },
    Refused: {
      type: "object",
      properties: { ok: { type: "boolean", const: false } },
      required: ["ok"],
    },
    JobState: { type: "string", enum: ["queued", "done"] },
  });

  it.each([
    [
      'isJsonObject(value) && typeof value["id"] === "string"',
      "an object and a required text",
    ],
    ['Number.isInteger(value["count"])', "an integer"],
    [
      'typeof value["state"] === "string"',
      "a closed set of texts, open to any text",
    ],
    ['value["result"] !== undefined', "a required member of any JSON"],
    [
      '(value["note"] === undefined || typeof value["note"] === "string")',
      "an optional member",
    ],
    [
      '(value["finished"] === undefined || (typeof value["finished"] === "string" || value["finished"] === null))',
      "a required member that names null, which may go missing",
    ],
    [
      'isJsonArrayOf(value["items"], (item0) => (isAnswered(item0) || isRefused(item0)))',
      "a list of a union",
    ],
    [
      'isJsonRecordOf(value["error"], (member0) => typeof member0 === "string")',
      "a record of texts",
    ],
    ['value["ok"] === true', "a const"],
  ])("tests %s, for %s", (test) => {
    expect(checks).toContain(test);
  });

  it("writes a check for each shape an answer reaches", () => {
    expect(checks).toContain(
      "export function isAnswer(value: JsonValue | undefined): value is Answer {",
    );
    expect(checks).toContain("export function isAnswered(");
    expect(checks).toContain("export function isRefused(");
  });

  it("refuses an object that names its members inside an answer", () => {
    expect(() =>
      checksOf({
        Answer: {
          type: "object",
          properties: {
            nested: { type: "object", properties: { a: { type: "string" } } },
          },
        },
      }),
    ).toThrow("names its members inside an answer");
  });
});
