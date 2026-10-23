// PATH: src/responses/envelope.ts

/**
 * ENVELOPE: recognising and opening the {technique, result} wrapper
 *
 * Purpose:
 *   The API answers some endpoints with the data itself and others with a
 *   wrapper around it:
 *
 *     {"summary": {...}, "planets": [...]}
 *     {"technique": "transits", "result": {...}}
 *
 *   A caller who learned chart.summary from one would find nothing on the
 *   other, over a difference that says nothing about their request. The
 *   wrapper is opened here, so a result reads the same everywhere.
 *
 * Deciding:
 *   enveloped   body                                  returned
 *   true        an object with a result member        body.result
 *   true        anything else                         body
 *   false       anything                              body
 *   undefined   exactly {technique: text, result}     body.result
 *   undefined   anything else                         body
 *
 *   Recognition is deliberately strict. Opening anything that merely owns a
 *   result member would swallow real data the day an endpoint publishes one.
 */

import { SUCCESS_ENVELOPE_KEYS } from "../models/constants/envelope.ts";
import type { JsonValue } from "../models/records/json.ts";
import { isJsonObject } from "./json.ts";

/**
 * Tell whether a body is the wrapper rather than the data.
 *
 * @internal
 * @param payload - A decoded body.
 * @returns True when the body is an object with exactly the members technique and result, and technique is text.
 *
 * @example
 * ```ts
 * isEnvelope({ technique: "chart", result: {} });            // true
 * isEnvelope({ technique: "chart", result: {}, page: 1 });   // false, a third member
 * isEnvelope({ technique: 7, result: {} });                  // false, technique is not text
 * ```
 */
export function isEnvelope(payload: JsonValue): boolean {
  if (!isJsonObject(payload)) {
    return false;
  }
  const members = Object.values(SUCCESS_ENVELOPE_KEYS);
  return (
    Object.keys(payload).length === members.length &&
    members.every((member) => Object.hasOwn(payload, member)) &&
    typeof payload[SUCCESS_ENVELOPE_KEYS.TECHNIQUE] === "string"
  );
}

/**
 * Open the wrapper when there is one, by the table drawn above.
 *
 * @internal
 * @param payload - A decoded body.
 * @param enveloped - What the endpoint publishes about its wrapper, or undefined to let the body decide.
 * @returns The data, with the wrapper removed when it was there.
 *
 * @example
 * ```ts
 * openEnvelope({ technique: "transits", result: { hits: [] } }, undefined);   // { hits: [] }
 * openEnvelope({ technique: "transits", result: { hits: [] } }, false);       // the whole body
 * openEnvelope({ result: 1, page: 2 }, true);                                 // 1
 * ```
 */
export function openEnvelope(
  payload: JsonValue,
  enveloped: boolean | undefined,
): JsonValue {
  const wrapped = enveloped ?? isEnvelope(payload);
  if (wrapped && isJsonObject(payload)) {
    const result = payload[SUCCESS_ENVELOPE_KEYS.RESULT];
    if (result !== undefined) {
      return result;
    }
  }
  return payload;
}
