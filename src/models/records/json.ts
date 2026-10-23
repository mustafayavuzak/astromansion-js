// PATH: src/models/records/json.ts

/**
 * JSON RECORDS: the types of a value a JSON document can hold
 *
 * Purpose:
 *   Wherever the API's schema leaves a shape open, the answer reaches the
 *   caller as one of these types, unchanged. They say only what JSON itself
 *   guarantees, so a caller narrows a field before reading it, and nothing
 *   typed here can disagree with what arrived.
 *
 * Absence:
 *   null    the server sent JSON's null
 *   absent  the server did not send the member, and reading it gives undefined
 */

/** A JSON value that holds no other value. */
export type JsonPrimitive = string | number | boolean | null;

/** A JSON array. */
export type JsonArray = readonly JsonValue[];

/** A JSON object, keyed by the names the server sent. */
export interface JsonObject {
  /** A member the server sent, read by its name. */
  readonly [member: string]: JsonValue;
}

/** Any value a JSON document can hold. */
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

/**
 * A text of a set the API may extend, typed by the values this release knows.
 *
 * @remarks
 * A closed set inside an answer, such as a job's state, may gain a value in
 * a later API release, and a client on this release must still read that
 * answer. The known values keep their names for completion and narrowing,
 * and any other text is allowed too, so a switch over one needs a default
 * branch.
 *
 * @typeParam Known - The values this release knows.
 *
 * @example
 * ```ts
 * const state: OpenSet<"queued" | "done"> = "queued";
 * const later: OpenSet<"queued" | "done"> = "cancelled";   // allowed, a later release may send it
 * ```
 */
export type OpenSet<Known extends string> =
  Known | (string & Record<never, never>);
