// PATH: src/responses/answers.ts

/**
 * ANSWERS: what a named method returns, read from the answer request() gave it
 *
 * Purpose:
 *   Every generated method hands its answer here, so each reads its answer
 *   the same way, by what the schema says about it:
 *
 *     the body is the data       readResult    the Result, typed by the body's shape
 *     the body is the wrapper    readWrapped   the Result, typed by the wrapper's result
 *     the body is free-form      readFreeForm  the Result, its wrapper recognised by its shape
 *     any JSON value             readAnyJson   the Result, or the text of a text/plain answer
 *     a document                 readDocument  the bytes, or the text of a text/plain document
 *
 *   A body that fails its check means the API answered outside its own
 *   schema. The error carries the body as its details, so the caller can
 *   still read the answer and report it.
 */

import { CLIENT_ERROR_CODES } from "../models/constants/errors.ts";
import { AstroMansionError } from "../models/errors/api.ts";
import type { JsonValue } from "../models/records/json.ts";
import {
  Result,
  type Result as AnswerResult,
  type ResultMembers,
} from "../response.ts";

/** What request() returns, which every reader takes. */
type RequestAnswer = ResultMembers | string | Uint8Array;

/**
 * Return the Result of an answer whose body is the data itself, once the body has its published shape.
 *
 * @internal
 * @typeParam Raw - The shape the API publishes for the body.
 * @param answer - What request() returned.
 * @param isShape - The body's check.
 * @param operation - The method's name, for the error's message.
 * @returns The Result, typed by the body's shape.
 * @throws {@link AstroMansionError} with the code unexpected_answer, when the answer is a document, text, or JSON of another shape. A JSON answer is the error's details.
 *
 * @example
 * ```ts
 * readResult(Result.build({ results: [] }), isGeoSearchResponse, "searchPlaces");   // the Result
 * readResult(Result.build({ found: [] }), isGeoSearchResponse, "searchPlaces");     // throws AstroMansionError
 * ```
 */
export function readResult<Raw extends JsonValue>(
  answer: RequestAnswer,
  isShape: (value: JsonValue) => value is Raw,
  operation: string,
): AnswerResult<Raw> {
  const result = checkedResult(answer, isShape, operation);
  return result as AnswerResult<Raw>; // isShape checked the body, which the endpoint's schema says is the data itself.
}

/**
 * Return the Result of an answer wrapped in `{technique, result}`, once the wrapper has its published shape.
 *
 * @internal
 * @typeParam Raw - The wrapper's shape.
 * @param answer - What request() returned.
 * @param isShape - The wrapper's check.
 * @param operation - The method's name, for the error's message.
 * @returns The Result, typed by the wrapper's result.
 * @throws {@link AstroMansionError} with the code unexpected_answer, when the answer is not the wrapper the API publishes.
 *
 * @example
 * ```ts
 * readWrapped(Result.build({ technique: "transits", result: [] }, "transits", true), isTechniqueEnvelope, "transits");
 * // the Result, its data []
 * ```
 */
export function readWrapped<Raw extends Readonly<{ result: JsonValue }>>(
  answer: RequestAnswer,
  isShape: (value: JsonValue) => value is Raw,
  operation: string,
): AnswerResult<Raw["result"]> {
  const result = checkedResult(answer, isShape, operation);
  return result as AnswerResult<Raw["result"]>; // isShape checked the wrapper, whose result member the endpoint's schema says is the data.
}

/**
 * Return the Result of an answer whose schema leaves its fields open, once the body is of the published kind.
 *
 * @internal
 * @param answer - What request() returned.
 * @param isShape - The body's check, such as that it is an object.
 * @param operation - The method's name, for the error's message.
 * @returns The Result, its wrapper opened when the body is exactly the wrapper.
 * @throws {@link AstroMansionError} with the code unexpected_answer, when the answer is a document, text, or JSON of another kind.
 *
 * @example
 * ```ts
 * readFreeForm(Result.build({ bodies: {} }), isJsonObject, "chart");   // the Result
 * ```
 */
export function readFreeForm(
  answer: RequestAnswer,
  isShape: (value: JsonValue) => boolean,
  operation: string,
): AnswerResult {
  return checkedResult(answer, isShape, operation);
}

/**
 * Return a JSON answer whose schema allows any JSON value, or the text a rendered answer arrived as.
 *
 * @internal
 * @param answer - What request() returned.
 * @param operation - The method's name, for the error's message.
 * @returns The Result, or the text of a text/plain answer, such as a rendered MansionSQL table.
 * @throws {@link AstroMansionError} with the code unexpected_answer, when the answer is a document.
 *
 * @example
 * ```ts
 * readAnyJson(Result.build([{ name: "Sun" }]), "query");   // the Result
 * readAnyJson("┌──────┐", "query");                       // "┌──────┐"
 * ```
 */
export function readAnyJson(
  answer: RequestAnswer,
  operation: string,
): AnswerResult | string {
  if (answer instanceof Uint8Array) {
    throw unexpectedAnswer(
      `the answer to ${operation} is a document, where the API publishes JSON`,
      undefined,
    );
  }
  return answer;
}

/**
 * Return a document as it arrived.
 *
 * @internal
 * @param answer - What request() returned for a document.
 * @param operation - The method's name, for the error's message.
 * @returns The bytes, or the text of a text/plain document.
 * @throws {@link AstroMansionError} with the code unexpected_answer, when the answer is JSON, which is then the error's details.
 *
 * @example
 * ```ts
 * readDocument(new Uint8Array([137, 80, 78, 71]), "renderPng");   // the same bytes
 * readDocument("Sun Leo", "exportCsv");                           // "Sun Leo"
 * ```
 */
export function readDocument(
  answer: RequestAnswer,
  operation: string,
): Uint8Array | string {
  if (answer instanceof Result) {
    throw unexpectedAnswer(
      `the answer to ${operation} is JSON, where the API publishes a document`,
      answer.raw,
    );
  }
  return answer;
}

/**
 * Check that an answer is JSON whose body passes its check.
 *
 * @param answer - What request() returned.
 * @param isShape - The body's check.
 * @param operation - The method's name, for the error's message.
 * @returns The answer's Result.
 * @throws {@link AstroMansionError} with the code unexpected_answer, when it is not.
 */
function checkedResult(
  answer: RequestAnswer,
  isShape: (value: JsonValue) => boolean,
  operation: string,
): ResultMembers {
  if (!(answer instanceof Result)) {
    throw unexpectedAnswer(
      `the answer to ${operation} is not JSON, where the API publishes JSON`,
      undefined,
    );
  }
  if (!isShape(answer.raw)) {
    throw unexpectedAnswer(
      `the answer to ${operation} does not have the shape the API publishes for it`,
      answer.raw,
    );
  }
  return answer;
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
