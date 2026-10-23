// PATH: src/response.ts

/**
 * RESPONSE: the Result a JSON answer becomes, read the same way whether or not it was wrapped
 *
 * Purpose:
 *   Some endpoints answer with the data itself and some wrap it as
 *   {technique, result}. A Result opens the wrapper, so every answer reads
 *   the same way and nobody has to remember which kind they called:
 *
 *     {"summary": {...}}                               ──► chart.summary, technique "natal"
 *     {"technique": "chart", "result": {"summary"}}    ──► chart.summary, technique "chart"
 *
 *   The data's fields are the Result's own fields, so chart.summary.Sun.sign
 *   and chart["summary"]["Sun"]["sign"] both read. data is the payload with
 *   the wrapper opened, raw is the body exactly as the server sent it, and
 *   technique is what the server called it, or the endpoint that was called.
 *
 * Names:
 *   data, raw, technique, toDict, and toString belong to the Result. A data
 *   field of the same name is read through data, such as chart.data.technique.
 *   result is the payload under the server's own wrapper name, unless the
 *   payload has a result field of its own, which then wins, since this
 *   alias must never hide data the server sent. A field the answer does not
 *   carry reads as undefined, and TypeScript names a mistyped field before
 *   the code runs.
 */

import { SUCCESS_ENVELOPE_KEYS } from "./models/constants/envelope.ts";
import type { JsonValue } from "./models/records/json.ts";
import { isJsonObject } from "./responses/json.ts";

/**
 * A name a Result keeps for itself, whose data field of the same name is read through data.
 *
 * @remarks
 * Every member but result, which yields to a data field of its own name.
 *
 * @example
 * ```ts
 * const name: ResultOwnName = "technique";
 * ```
 */
export type ResultOwnName = Exclude<keyof ResultMembers, "result">;

/** What a Result keeps for itself. */
const RESULT_CONFIG = Object.freeze({
  /** The names a data field never replaces, checked against ResultOwnName both ways. */
  OWN_NAMES: Object.freeze({
    data: true,
    raw: true,
    technique: true,
    toDict: true,
    toString: true,
  } satisfies Record<ResultOwnName, true>),
} as const);

/**
 * The members every Result has, whatever its data.
 *
 * @typeParam Data - The payload, with any wrapper opened.
 */
export interface ResultMembers<Data extends JsonValue = JsonValue> {
  /** The payload proper, with any wrapper opened. */
  readonly data: Data;
  /** The complete body the server sent, wrapper included. */
  readonly raw: JsonValue;
  /** What the server called this, or the endpoint that was called. */
  readonly technique: string | undefined;
  /** The payload under the server's own wrapper name. A payload with a result field of its own gives that field. */
  readonly result: Data extends { readonly result: infer Inner } ? Inner : Data;
  /**
   * Return the data as plain JSON, untouched.
   *
   * @returns A copy of an object payload, so changing it leaves the Result as it was, or the payload itself otherwise.
   */
  toDict(): Data;
  /**
   * Show the payload and the technique, as Python's repr shows a Result.
   *
   * @returns `Result(<payload>)`, with the technique when there is one.
   */
  toString(): string;
}

/**
 * The fields a Result reads through to its data.
 *
 * @remarks
 * A list's items read by their index. An untyped payload offers no fields,
 * so it is read through data.
 *
 * @typeParam Data - The payload, with any wrapper opened.
 */
export type ResultFields<Data extends JsonValue> = JsonValue extends Data
  ? unknown
  : Data extends readonly (infer Item)[]
    ? Readonly<Record<number, Item>>
    : Data extends object
      ? Readonly<Omit<Data, ResultOwnName>>
      : unknown;

/**
 * An API answer, read the same way whether or not it was wrapped.
 *
 * @typeParam Data - The payload, with any wrapper opened.
 *
 * @example
 * ```ts
 * const chart = await client.natal({ date: "2000-01-01", lat: 51.4779, lon: 0 });
 * chart.summary.Sun.sign;          // the data's own fields
 * chart["summary"]["Sun"]["sign"]; // the same field
 * chart.technique;                 // "natal"
 * chart.raw;                       // the body as the server sent it
 * ```
 */
export type Result<Data extends JsonValue = JsonValue> = ResultMembers<Data> &
  ResultFields<Data>;

/** How a Result is built, and how a body is recognised as the wrapper. */
export interface ResultConstructor {
  /**
   * Hold a payload whose wrapper, if any, is already opened.
   *
   * @param data - The payload proper.
   * @param technique - What the server called it, or the endpoint that was called.
   * @param raw - The complete body the server sent. It defaults to data.
   */
  new <Data extends JsonValue = JsonValue>(
    data: Data,
    technique?: string,
    raw?: JsonValue,
  ): ResultMembers<Data>;
  /** The members every Result shares. */
  readonly prototype: ResultMembers;
  /**
   * Tell whether a body is the wrapper rather than the data.
   *
   * @remarks
   * Deliberately strict. Opening anything that merely owns a result field
   * would swallow real data the day an endpoint publishes one.
   *
   * @param payload - A decoded body.
   * @returns True when the body is exactly `{technique, result}` and technique is text.
   *
   * @example
   * ```ts
   * Result.isEnvelope({ technique: "chart", result: {} });            // true
   * Result.isEnvelope({ technique: "chart", result: {}, page: 1 });   // false
   * ```
   */
  isEnvelope(payload: JsonValue): boolean;
  /**
   * Wrap a decoded body, opening the wrapper when there is one.
   *
   * @param payload - A decoded body.
   * @param technique - The endpoint's name, used when the body names none.
   * @param enveloped - What the schema says about the wrapper: true, false, or undefined when the schema is free-form and the body has to be recognised.
   * @returns A Result reading the data and keeping the body.
   *
   * @example
   * ```ts
   * Result.build({ planets: [] }, "natal").technique;                          // "natal"
   * Result.build({ technique: "chart", result: { a: 1 } }).data;               // { a: 1 }
   * Result.build({ technique: "x", result: { a: 1 } }, undefined, false).data; // the whole body
   * ```
   */
  build(payload: JsonValue, technique?: string, enveloped?: boolean): Result;
}

/**
 * The Result itself, the class every JSON answer becomes.
 *
 * @remarks
 * The class is closed to extension. Its instances are frozen.
 */
class AnswerResult<Data extends JsonValue> implements ResultMembers<Data> {
  declare readonly data: Data;
  declare readonly raw: JsonValue;
  declare readonly technique: string | undefined;
  declare readonly result: Data extends { readonly result: infer Inner }
    ? Inner
    : Data;

  /**
   * Hold a payload, its fields as the Result's own fields.
   *
   * @param data - The payload proper.
   * @param technique - What the server called it, or the endpoint that was called.
   * @param raw - The complete body the server sent. It defaults to data.
   */
  constructor(data: Data, technique?: string, raw: JsonValue = data) {
    for (const [name, value] of fieldsOf(data)) {
      // defineProperty, unlike assignment, makes a field named __proto__ a field and never a prototype.
      Object.defineProperty(this, name, { value, enumerable: true });
    }
    Object.defineProperties(this, {
      data: { value: data },
      raw: { value: raw },
      technique: { value: technique },
    });
    if (!(
      isJsonObject(data) && Object.hasOwn(data, SUCCESS_ENVELOPE_KEYS.RESULT)
    )) {
      Object.defineProperty(this, SUCCESS_ENVELOPE_KEYS.RESULT, {
        value: data,
      });
    }
    Object.freeze(this);
  }

  /** {@inheritDoc ResultMembers.toDict} */
  toDict(): Data {
    return isJsonObject(this.data) ? Object.assign({}, this.data) : this.data;
  }

  /**
   * Show the payload and the technique.
   *
   * @returns `Result(<payload>)`, with the technique when there is one.
   */
  toString(): string {
    const named = this.technique ? `, technique='${this.technique}'` : "";
    return `Result(${JSON.stringify(this.data)}${named})`;
  }

  /** {@inheritDoc ResultConstructor.isEnvelope} */
  static isEnvelope(payload: JsonValue): boolean {
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

  /** {@inheritDoc ResultConstructor.build} */
  static build(
    payload: JsonValue,
    technique?: string,
    enveloped?: boolean,
  ): Result {
    const wrapped = enveloped ?? AnswerResult.isEnvelope(payload);
    if (
      wrapped &&
      isJsonObject(payload) &&
      Object.hasOwn(payload, SUCCESS_ENVELOPE_KEYS.RESULT)
    ) {
      const named = payload[SUCCESS_ENVELOPE_KEYS.TECHNIQUE];
      return new AnswerResult(
        payload[SUCCESS_ENVELOPE_KEYS.RESULT] ?? null,
        typeof named === "string" ? named : technique,
        payload,
      );
    }
    return new AnswerResult(payload, technique, payload);
  }
}

/**
 * An API answer, read the same way whether or not it was wrapped.
 *
 * @remarks
 * Every named method and request() return one for a JSON answer. Build one
 * with {@link ResultConstructor.build}, and tell one apart with instanceof.
 */
export const Result: ResultConstructor = AnswerResult;

/**
 * List the fields a payload lends its Result.
 *
 * @param data - The payload.
 * @returns An object's fields other than the names a Result keeps, a list's items by index, and nothing for any other value.
 */
function fieldsOf(data: JsonValue): readonly (readonly [string, JsonValue])[] {
  if (Array.isArray(data)) {
    return data.map((item, index) => [String(index), item] as const);
  }
  if (isJsonObject(data)) {
    return Object.entries(data).filter(
      ([field]) => !Object.hasOwn(RESULT_CONFIG.OWN_NAMES, field),
    );
  }
  return [];
}
