// PATH: src/responses/json.ts

/**
 * JSON BODIES: reading a body as JSON, and telling its kinds of value apart
 *
 * Purpose:
 *   A body is parsed once, by the platform's JSON parser, which yields only
 *   JSON values: null, booleans, numbers, text, arrays, and objects. Text
 *   that is not JSON reads as undefined rather than as a failure, since a
 *   body may honestly be plain text or a document.
 *
 *   The generated answer checks are built from the tests here: present,
 *   an object, a list whose every item passes a test, and an object whose
 *   every value passes one.
 */

import type {
  JsonArray,
  JsonObject,
  JsonValue,
} from "../models/records/json.ts";

/**
 * Parse a body as JSON.
 *
 * @internal
 * @param text - The body, read as text.
 * @returns The JSON value, or undefined when the text is not JSON.
 *
 * @example
 * ```ts
 * parseJsonBody('{"sign": "Leo"}');   // { sign: "Leo" }
 * parseJsonBody("null");              // null, a value the server sent
 * parseJsonBody("Saturn Taurus");     // undefined
 * ```
 */
export function parseJsonBody(text: string): JsonValue | undefined {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed as JsonValue; // JSON.parse yields only JSON values and throws on anything else
  } catch {
    return undefined;
  }
}

/**
 * Tell a JSON object from the other JSON values.
 *
 * @internal
 * @param value - A JSON value, or undefined for a body that was not JSON.
 * @returns True for an object, false for an array, null, a primitive, or undefined.
 */
export function isJsonObject(
  value: JsonValue | undefined,
): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Tell a present JSON value from a member that is missing.
 *
 * @internal
 * @param value - A member as read, undefined when the answer did not send it.
 * @returns True for any JSON value, null included.
 *
 * @example
 * ```ts
 * isJsonValue(null);        // true, a value the server sent
 * isJsonValue(undefined);   // false
 * ```
 */
export function isJsonValue(value: JsonValue | undefined): value is JsonValue {
  return value !== undefined;
}

/**
 * Tell a JSON list whose every item passes a test.
 *
 * @internal
 * @param value - A JSON value, or undefined for a missing member.
 * @param isItem - The test each item must pass. Every item passes without one.
 * @returns True for a list whose items all pass, an empty list included.
 *
 * @example
 * ```ts
 * isJsonArrayOf(["Leo", "Virgo"], (item) => typeof item === "string");   // true
 * isJsonArrayOf(["Leo", 5], (item) => typeof item === "string");         // false
 * isJsonArrayOf({ sign: "Leo" });                                        // false, not a list
 * ```
 */
export function isJsonArrayOf(
  value: JsonValue | undefined,
  isItem?: (item: JsonValue) => boolean,
): value is JsonArray {
  if (!Array.isArray(value)) {
    return false;
  }
  const items = value as JsonArray; // Array.isArray checked it above
  return isItem === undefined || items.every(isItem);
}

/**
 * Tell a JSON object whose every value passes a test.
 *
 * @internal
 * @param value - A JSON value, or undefined for a missing member.
 * @param isMember - The test each value must pass.
 * @returns True for an object whose values all pass, an empty object included.
 *
 * @example
 * ```ts
 * isJsonRecordOf({ code: "quota" }, (member) => typeof member === "string");   // true
 * isJsonRecordOf({ code: 429 }, (member) => typeof member === "string");       // false
 * ```
 */
export function isJsonRecordOf(
  value: JsonValue | undefined,
  isMember: (member: JsonValue) => boolean,
): value is JsonObject {
  return isJsonObject(value) && Object.values(value).every(isMember);
}
