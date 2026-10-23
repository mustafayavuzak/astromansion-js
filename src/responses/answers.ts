// PATH: src/responses/answers.ts

/**
 * ANSWERS: what a named method returns, read from the answer request() gave it
 *
 * Purpose:
 *   Every generated method hands its answer here, so each reads its answer
 *   the same way:
 *
 *     JSON answer   its shape's check passes   ──► the answer, typed as that shape
 *                   the check fails            ──► AstroMansionError, code unexpected_answer
 *     document      bytes                      ──► the bytes
 *                   text/plain text            ──► the text's UTF-8 bytes
 *
 *   A check that fails means the API answered outside its own schema. The
 *   error carries the answer as its details, so the caller can still read
 *   the answer and report it.
 */

import { CLIENT_ERROR_CODES } from "../models/constants/errors.ts";
import { AstroMansionError } from "../models/errors/api.ts";
import type { JsonValue } from "../models/records/json.ts";

/**
 * Return a JSON answer once it has its published shape.
 *
 * @internal
 * @typeParam Shape - The shape the API publishes for the answer.
 * @param answer - What request() returned.
 * @param isShape - The shape's check.
 * @param operation - The method's name, for the error's message.
 * @returns The answer, typed as its shape.
 * @throws {@link AstroMansionError} with the code unexpected_answer, when the answer is a document or JSON of another shape. A JSON answer is the error's details.
 *
 * @example
 * ```ts
 * readJson({ results: [] }, isGeoSearchResponse, "searchPlaces");   // { results: [] }
 * readJson({ found: [] }, isGeoSearchResponse, "searchPlaces");     // throws AstroMansionError
 * ```
 */
export function readJson<Shape extends JsonValue>(
  answer: JsonValue | string | Uint8Array,
  isShape: (value: JsonValue) => value is Shape,
  operation: string,
): Shape {
  if (answer instanceof Uint8Array) {
    throw unexpectedAnswer(
      `the answer to ${operation} is a document, where the API publishes JSON`,
      undefined,
    );
  }
  if (!isShape(answer)) {
    throw unexpectedAnswer(
      `the answer to ${operation} does not have the shape the API publishes for it`,
      answer,
    );
  }
  return answer;
}

/**
 * Return a document's bytes.
 *
 * @internal
 * @param answer - What request() returned for a document.
 * @param operation - The method's name, for the error's message.
 * @returns The bytes as they arrived, or the UTF-8 bytes of a text/plain document.
 * @throws {@link AstroMansionError} with the code unexpected_answer, when the answer is JSON, which is then the error's details.
 *
 * @example
 * ```ts
 * readDocument(new Uint8Array([137, 80, 78, 71]), "renderPng");   // the same bytes
 * readDocument("Sun Leo", "exportCsv");                           // the text's UTF-8 bytes
 * ```
 */
export function readDocument(
  answer: JsonValue | string | Uint8Array,
  operation: string,
): Uint8Array {
  if (answer instanceof Uint8Array) {
    return answer;
  }
  if (typeof answer === "string") {
    return new TextEncoder().encode(answer);
  }
  throw unexpectedAnswer(
    `the answer to ${operation} is JSON, where the API publishes a document`,
    answer,
  );
}

/**
 * Build the error of an answer outside its published shape.
 *
 * @param message - What was expected and what arrived.
 * @param details - The answer, when it is JSON.
 * @returns The error, with the code unexpected_answer.
 */
function unexpectedAnswer(
  message: string,
  details: JsonValue | undefined,
): AstroMansionError {
  return new AstroMansionError(message, {
    errorCode: CLIENT_ERROR_CODES.UNEXPECTED_ANSWER,
    details,
  });
}
