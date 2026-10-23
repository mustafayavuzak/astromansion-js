// PATH: src/requestBodies.ts

/**
 * REQUEST BODIES: the bodies the endpoints declare, built and checked before sending
 *
 * Purpose:
 *   A chart method takes the birth fields flat, and the client nests them
 *   under birth, as the API declares. The birth is checked here, so an error
 *   names the field the caller wrote rather than a JSON path the client
 *   built for them:
 *
 *     client.natal({ date: "2000-01-01", lat: 51.4779, lon: 0 }, { options: { wheel: true } })
 *       ──► {"birth": {"date": "2000-01-01", "lat": 51.4779, "lon": 0}, "options": {"wheel": true}}
 *
 * Arguments:
 *   Python's keyword arguments are one object here. The fields and the
 *   method's other arguments (options, output, signal) may share the first
 *   object, or the other arguments may come in a second one:
 *
 *     client.natal({ date, lat, lon, options })     the fields and the options together
 *     client.natal(birth, { options })              the birth fields alone, the options apart
 *
 *   A field the method does not take, or an argument given in both objects,
 *   is refused before sending. A field set to undefined counts as not given.
 */

import {
  BIRTH_FIELD_NAMES,
  BIRTH_FIELDS,
  BIRTH_LIMITS,
  BIRTH_PATTERNS,
} from "./models/constants/birth.ts";
import {
  CALL_KEYWORDS,
  REQUEST_BODY,
  SHARECARD,
} from "./models/constants/bodies.ts";
import { CLIENT_ERROR_CODES } from "./models/constants/errors.ts";
import { ValidationError } from "./models/errors/api.ts";
import type { QueryValue } from "./models/records/client.ts";
import type { JsonObject, JsonValue } from "./models/records/json.ts";

/** How the arguments are read and how a refused value is shown. */
const REQUEST_BODIES_CONFIG = Object.freeze({
  /**
   * A number written as text, as Python's float() reads it: digits with an
   * optional fraction and exponent. Accepts `51.4779`, `-0.5`, `.5`, `1e3`.
   * Refuses `0x10`, `51,4779`, and empty text.
   */
  DECIMAL_TEXT: /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/,
  /** The share card's keyword arguments, which never reach the body as extra fields. */
  SHARECARD_KEYWORDS: Object.freeze(["type", "name", "names", "lang"] as const),
  /** The decimals a coordinate range is shown with, as Python writes a float. */
  RANGE_DECIMALS: 1,
} as const);

/**
 * A method's arguments, as a caller passes them in one object.
 *
 * @internal
 */
export type CallArguments = Readonly<Record<string, unknown>>;

/**
 * A call made ready: the body to send, and how to send it.
 *
 * @internal
 */
export interface PreparedCall {
  /** The JSON body. */
  readonly json: JsonObject;
  /** The path to write a document to, or undefined to keep it. */
  readonly output: string | undefined;
  /** The caller's cancellation. */
  readonly signal: AbortSignal | undefined;
}

/**
 * A call without a body made ready: its query, and how to send it.
 *
 * @internal
 */
export interface PreparedParams {
  /** The query parameters, those set to undefined or null left out. */
  readonly params: Readonly<Record<string, QueryValue>>;
  /** The caller's cancellation. */
  readonly signal: AbortSignal | undefined;
}

/** A method's other arguments, read out of the objects a caller passed. */
interface SplitArguments {
  /** The fields that remain, those set to undefined left out. */
  readonly fields: Readonly<Record<string, unknown>>;
  /** The arguments the method takes beside its fields, by name. */
  readonly keywords: Readonly<Record<string, unknown>>;
}

/**
 * Build and check the bodies the endpoints declare.
 *
 * @internal
 */
export const RequestBodies = Object.freeze({
  birth,
  chart,
  pair,
  body,
  params,
  sharecard,
});

/**
 * Build the birth object, checked before it is sent.
 *
 * @param method - The method's name, for messages.
 * @param fields - The birth fields.
 * @returns The birth object, holding only the fields that were given.
 * @throws TypeError when date, lat, or lon is missing, or a field the birth does not hold is given.
 * @throws {@link ValidationError} when a field cannot be the value given.
 *
 * @example
 * ```ts
 * birth("natal", { date: "2000-01-01", lat: 51.4779, lon: 0 });   // { date: "2000-01-01", lat: 51.4779, lon: 0 }
 * birth("natal", { date: "01-01-2000", lat: 0, lon: 0 });         // throws ValidationError, date must look like YYYY-MM-DD
 * ```
 */
function birth(method: string, fields: CallArguments): JsonObject {
  for (const name of Object.keys(fields)) {
    if (fields[name] !== undefined && !BIRTH_FIELD_NAMES.includes(name)) {
      throw unexpectedField(method, name);
    }
  }
  const date = givenField(fields, BIRTH_FIELDS.DATE);
  const time = givenField(fields, BIRTH_FIELDS.TIME);
  const lat = givenField(fields, BIRTH_FIELDS.LAT);
  const lon = givenField(fields, BIRTH_FIELDS.LON);
  for (const [name, value] of [
    [BIRTH_FIELDS.DATE, date],
    [BIRTH_FIELDS.LAT, lat],
    [BIRTH_FIELDS.LON, lon],
  ] as const) {
    if (value === undefined) {
      throw new TypeError(`${method}() missing the birth field '${name}'`);
    }
  }
  if (typeof date !== "string" || !BIRTH_PATTERNS.DATE.test(date)) {
    throw invalid(`date must look like YYYY-MM-DD, got ${shown(date)}`);
  }
  if (
    time !== undefined &&
    (typeof time !== "string" || !BIRTH_PATTERNS.TIME.test(time))
  ) {
    throw invalid(`time must look like HH:MM, got ${shown(time)}`);
  }
  const latitude = degrees(lat);
  const longitude = degrees(lon);
  if (latitude === undefined || longitude === undefined) {
    throw invalid(
      `lat and lon must be numbers, got ${shown(lat)} and ${shown(lon)}`,
    );
  }
  checkRange(
    BIRTH_FIELDS.LAT,
    lat,
    latitude,
    BIRTH_LIMITS.LAT_MIN_DEGREES,
    BIRTH_LIMITS.LAT_MAX_DEGREES,
  );
  checkRange(
    BIRTH_FIELDS.LON,
    lon,
    longitude,
    BIRTH_LIMITS.LON_MIN_DEGREES,
    BIRTH_LIMITS.LON_MAX_DEGREES,
  );
  const built: Record<string, JsonValue> = {
    [BIRTH_FIELDS.DATE]: date,
    [BIRTH_FIELDS.LAT]: latitude,
    [BIRTH_FIELDS.LON]: longitude,
  };
  if (time !== undefined) {
    built[BIRTH_FIELDS.TIME] = time;
  }
  for (const name of [BIRTH_FIELDS.TIMEZONE, BIRTH_FIELDS.HOUSES]) {
    const value = givenField(fields, name);
    if (value !== undefined) {
      built[name] = jsonOf(method, name, value);
    }
  }
  return built;
}

/**
 * Build the body a one-person endpoint expects.
 *
 * @param method - The method's name, for messages.
 * @param first - The birth fields, with the method's other arguments allowed beside them.
 * @param second - The method's other arguments, when they come apart.
 * @param document - Whether the endpoint answers with a document, which allows output.
 * @returns The body `{birth, options}`, options left out when empty, and how to send it.
 * @throws TypeError when an argument is unknown, given twice, or of the wrong kind.
 * @throws {@link ValidationError} when a birth field cannot be the value given.
 *
 * @example
 * ```ts
 * chart("natal", { date: "2000-01-01", lat: 0, lon: 0 }, { options: { wheel: true } }, false).json;
 * // { birth: { date: "2000-01-01", lat: 0, lon: 0 }, options: { wheel: true } }
 * ```
 */
function chart(
  method: string,
  first: CallArguments,
  second: CallArguments | undefined,
  document: boolean,
): PreparedCall {
  const split = splitArguments(method, first, second, [
    REQUEST_BODY.OPTIONS,
    ...callKeywords(document),
  ]);
  const built: Record<string, JsonValue> = {
    [REQUEST_BODY.BIRTH]: birth(method, split.fields),
  };
  const options = optionsOf(method, split.keywords[REQUEST_BODY.OPTIONS]);
  if (options !== undefined) {
    built[REQUEST_BODY.OPTIONS] = options;
  }
  return prepared(method, built, split.keywords);
}

/**
 * Build the body a two-person endpoint expects.
 *
 * @remarks
 * The API names the second person partner, not second. The wire contract
 * decides, not what reads nicely here.
 *
 * @param method - The method's name, for messages.
 * @param first - The first person's birth fields.
 * @param second - The second person's birth fields.
 * @param keywords - The options, output, signal, and further top-level body fields.
 * @param document - Whether the endpoint answers with a document, which allows output.
 * @returns The body `{birth, partner}`, with the options and the further fields, and how to send it.
 * @throws TypeError when an argument is of the wrong kind.
 * @throws {@link ValidationError} when a birth field of either person cannot be the value given.
 */
function pair(
  method: string,
  first: CallArguments,
  second: CallArguments,
  keywords: CallArguments | undefined,
  document: boolean,
): PreparedCall {
  const split = splitArguments(method, keywords ?? {}, undefined, [
    REQUEST_BODY.OPTIONS,
    ...callKeywords(document),
  ]);
  const built: Record<string, JsonValue> = {
    [REQUEST_BODY.BIRTH]: birth(method, objectArgument(method, first)),
    [REQUEST_BODY.PARTNER]: birth(method, objectArgument(method, second)),
  };
  const options = optionsOf(method, split.keywords[REQUEST_BODY.OPTIONS]);
  if (options !== undefined) {
    built[REQUEST_BODY.OPTIONS] = options;
  }
  addFields(method, built, split.fields);
  return prepared(method, built, split.keywords);
}

/**
 * Build a body the endpoint declares whole, sent as given.
 *
 * @param method - The method's name, for messages.
 * @param first - The body's fields, with output and signal allowed beside them.
 * @param second - Output and signal, when they come apart.
 * @param document - Whether the endpoint answers with a document, which allows output.
 * @returns The body, and how to send it.
 * @throws TypeError when an argument is of the wrong kind or given twice.
 */
function body(
  method: string,
  first: CallArguments,
  second: CallArguments | undefined,
  document: boolean,
): PreparedCall {
  const split = splitArguments(method, first, second, callKeywords(document));
  const built: Record<string, JsonValue> = {};
  addFields(method, built, split.fields);
  return prepared(method, built, split.keywords);
}

/**
 * Build the query of a call without a body.
 *
 * @param method - The method's name, for messages.
 * @param fields - The query parameters, with signal allowed beside them.
 * @returns The parameters, those set to undefined or null left out, and the signal.
 * @throws TypeError when a parameter is not text, a number, or a boolean.
 *
 * @example
 * ```ts
 * params("eclipses", { year: 2027, lang: undefined }).params;   // { year: 2027 }
 * ```
 */
function params(
  method: string,
  fields: CallArguments | undefined,
): PreparedParams {
  const split = splitArguments(method, fields ?? {}, undefined, [
    CALL_KEYWORDS.SIGNAL,
  ]);
  const query: Record<string, QueryValue> = {};
  for (const [name, value] of Object.entries(split.fields)) {
    if (value === null) {
      continue;
    }
    if (
      typeof value !== "string" &&
      typeof value !== "number" &&
      typeof value !== "boolean"
    ) {
      throw new TypeError(
        `${method}() got the query value ${shown(value)} for '${name}', which is not text, a number, or a boolean`,
      );
    }
    query[name] = value;
  }
  return {
    params: query,
    signal: signalOf(method, split.keywords[CALL_KEYWORDS.SIGNAL]),
  };
}

/**
 * Build the body of the share card, for one chart or for two.
 *
 * @remarks
 * Three call styles reach the same body: two charts positionally, one chart
 * and null for a natal card, or one chart's fields passed flat among the
 * keyword arguments. Birth fields found there are taken out of them.
 *
 * @param first - The chart, or the first of two. Null or undefined reads the chart's fields from the keyword arguments.
 * @param second - The second chart, which a synastry card needs.
 * @param keywords - type, name, names, lang, output, signal, one chart's birth fields, and further top-level fields.
 * @returns The share card's body, and how to send it.
 * @throws TypeError when both name and names are given, or an argument is of the wrong kind.
 * @throws {@link ValidationError} when a birth field cannot be the value given.
 *
 * @example
 * ```ts
 * sharecard(null, null, { type: "natal", name: "Ada", date: "2000-01-01", lat: 0, lon: 0 }).json;
 * // { birth: { date: "2000-01-01", lat: 0, lon: 0 }, type: "natal", names: ["Ada"] }
 * ```
 */
function sharecard(
  first: CallArguments | null | undefined,
  second: CallArguments | null | undefined,
  keywords: CallArguments | undefined,
): PreparedCall {
  const method = SHARECARD.TECHNIQUE;
  const split = splitArguments(method, keywords ?? {}, undefined, [
    ...REQUEST_BODIES_CONFIG.SHARECARD_KEYWORDS,
    ...callKeywords(true),
  ]);
  const flat: Record<string, unknown> = {};
  const extra: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(split.fields)) {
    if (BIRTH_FIELD_NAMES.includes(name)) {
      flat[name] = value;
    } else {
      extra[name] = value;
    }
  }
  const chartFields =
    first === null || first === undefined
      ? flat
      : objectArgument(method, first);
  if (first !== null && first !== undefined) {
    Object.assign(extra, flat);
  }
  const named = split.keywords;
  const built: Record<string, JsonValue> = {
    [REQUEST_BODY.BIRTH]: birth(method, chartFields),
    [SHARECARD.TYPE]: jsonOf(
      method,
      SHARECARD.TYPE,
      named[SHARECARD.TYPE] ?? SHARECARD.SYNASTRY,
    ),
  };
  if (second !== null && second !== undefined) {
    built[REQUEST_BODY.PARTNER] = birth(method, objectArgument(method, second));
  }
  const name = named["name"];
  const names = named[SHARECARD.NAMES];
  if (name !== undefined && names !== undefined) {
    throw new TypeError("pass either name or names, not both");
  }
  if (name !== undefined) {
    built[SHARECARD.NAMES] = [jsonOf(method, "name", name)];
  } else if (names !== undefined) {
    built[SHARECARD.NAMES] = jsonOf(method, SHARECARD.NAMES, names);
  }
  const lang = named[SHARECARD.LANG];
  if (lang !== undefined) {
    built[SHARECARD.LANG] = jsonOf(method, SHARECARD.LANG, lang);
  }
  addFields(method, built, extra);
  return prepared(method, built, named);
}

/**
 * Name the arguments every method takes beside its fields.
 *
 * @param document - Whether the endpoint answers with a document, which allows output.
 * @returns signal, and output for a document.
 */
function callKeywords(document: boolean): readonly string[] {
  return document
    ? [CALL_KEYWORDS.OUTPUT, CALL_KEYWORDS.SIGNAL]
    : [CALL_KEYWORDS.SIGNAL];
}

/**
 * Read a method's other arguments out of the one or two objects a caller passed.
 *
 * @param method - The method's name, for messages.
 * @param first - The first object, holding fields and maybe other arguments.
 * @param second - The second object, holding only other arguments.
 * @param names - The other arguments the method takes.
 * @returns The fields that remain, and the other arguments by name.
 * @throws TypeError when an object is not an object, the second holds a field, or an argument is in both.
 */
function splitArguments(
  method: string,
  first: CallArguments,
  second: CallArguments | undefined,
  names: readonly string[],
): SplitArguments {
  const fields: Record<string, unknown> = {};
  const keywords: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(objectArgument(method, first))) {
    if (value === undefined) {
      continue;
    }
    if (names.includes(name)) {
      keywords[name] = value;
    } else {
      fields[name] = value;
    }
  }
  if (second !== undefined) {
    for (const [name, value] of Object.entries(
      objectArgument(method, second),
    )) {
      if (value === undefined) {
        continue;
      }
      if (!names.includes(name)) {
        throw unexpectedField(method, name);
      }
      if (keywords[name] !== undefined) {
        throw new TypeError(`${method}() got multiple values for '${name}'`);
      }
      keywords[name] = value;
    }
  }
  return { fields, keywords };
}

/**
 * Finish a call from its body and its other arguments.
 *
 * @param method - The method's name, for messages.
 * @param built - The body.
 * @param keywords - The other arguments, output and signal among them.
 * @returns The prepared call.
 * @throws TypeError when output is not text or signal is not an AbortSignal.
 */
function prepared(
  method: string,
  built: Record<string, JsonValue>,
  keywords: Readonly<Record<string, unknown>>,
): PreparedCall {
  const output = keywords[CALL_KEYWORDS.OUTPUT];
  if (output !== undefined && typeof output !== "string") {
    throw new TypeError(
      `${method}() takes output as a path, got ${shown(output)}`,
    );
  }
  return {
    json: built,
    output,
    signal: signalOf(method, keywords[CALL_KEYWORDS.SIGNAL]),
  };
}

/**
 * Add fields to a body as JSON, leaving out those set to undefined.
 *
 * @param method - The method's name, for messages.
 * @param built - The body, written in place.
 * @param fields - The fields to add.
 * @throws TypeError when a field is not a JSON value.
 */
function addFields(
  method: string,
  built: Record<string, JsonValue>,
  fields: Readonly<Record<string, unknown>>,
): void {
  for (const [name, value] of Object.entries(fields)) {
    if (value !== undefined) {
      built[name] = jsonOf(method, name, value);
    }
  }
}

/**
 * Read the options a caller gave, left out when empty.
 *
 * @param method - The method's name, for messages.
 * @param value - The options, or undefined.
 * @returns The options as a JSON object, or undefined when none or an empty object was given.
 * @throws TypeError when the options are not an object of JSON values.
 */
function optionsOf(method: string, value: unknown): JsonObject | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  const options = jsonOf(method, REQUEST_BODY.OPTIONS, value);
  if (!isRecord(options)) {
    throw new TypeError(
      `${method}() takes options as an object, got ${shown(value)}`,
    );
  }
  return Object.keys(options).length === 0 ? undefined : options;
}

/**
 * Read the caller's cancellation.
 *
 * @param method - The method's name, for messages.
 * @param value - The signal, or undefined.
 * @returns The signal, or undefined.
 * @throws TypeError when the value is not an AbortSignal.
 */
function signalOf(method: string, value: unknown): AbortSignal | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof AbortSignal === "undefined" || !(value instanceof AbortSignal)) {
    throw new TypeError(
      `${method}() takes signal as an AbortSignal, got ${shown(value)}`,
    );
  }
  return value;
}

/**
 * Check that an argument is a plain object of fields.
 *
 * @param method - The method's name, for messages.
 * @param value - The argument.
 * @returns The argument, as fields.
 * @throws TypeError when the argument is not an object, or is a list.
 */
function objectArgument(method: string, value: unknown): CallArguments {
  if (!isRecord(value)) {
    throw new TypeError(
      `${method}() takes its fields as an object, got ${kindOf(value)}`,
    );
  }
  return value;
}

/**
 * Check that a value can travel as JSON.
 *
 * @param method - The method's name, for messages.
 * @param name - The field's name, for messages.
 * @param value - The value.
 * @returns The value, as JSON.
 * @throws TypeError when the value, or a value inside it, is not JSON.
 */
function jsonOf(method: string, name: string, value: unknown): JsonValue {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean" ||
    (typeof value === "number" && Number.isFinite(value))
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item: unknown) => jsonOf(method, name, item));
  }
  if (isRecord(value)) {
    const members: Record<string, JsonValue> = {};
    for (const [member, inner] of Object.entries(value)) {
      if (inner !== undefined) {
        members[member] = jsonOf(method, name, inner);
      }
    }
    return members;
  }
  throw new TypeError(
    `${method}() got ${shown(value)} for '${name}', which JSON cannot carry`,
  );
}

/**
 * Read a field the caller gave.
 *
 * @param fields - The fields.
 * @param name - The field's name.
 * @returns The value, or undefined when the field is absent, undefined, or null.
 */
function givenField(fields: CallArguments, name: string): unknown {
  const value = fields[name];
  return value === null ? undefined : value;
}

/**
 * Read a coordinate as a number, as Python's float() would.
 *
 * @param value - The value the caller gave.
 * @returns The number, or undefined when the value is not a number or numeric text.
 */
function degrees(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const text = value.trim();
    return REQUEST_BODIES_CONFIG.DECIMAL_TEXT.test(text)
      ? Number(text)
      : undefined;
  }
  return undefined;
}

/**
 * Refuse a coordinate outside its range.
 *
 * @param name - The field's name.
 * @param given - The value the caller gave, shown in the message.
 * @param value - The value as a number.
 * @param low - The lowest value, included.
 * @param high - The highest value, included.
 * @throws {@link ValidationError} when the value lies outside the range.
 */
function checkRange(
  name: string,
  given: unknown,
  value: number,
  low: number,
  high: number,
): void {
  if (!(low <= value && value <= high)) {
    const decimals = REQUEST_BODIES_CONFIG.RANGE_DECIMALS;
    throw invalid(
      `${name} must be within ${low.toFixed(decimals)}..${high.toFixed(decimals)}, got ${shown(given)}`,
    );
  }
}

/**
 * Build the error of a field that cannot be the value given.
 *
 * @param message - What is wrong, naming the field.
 * @returns The error, with the code validation.
 */
function invalid(message: string): ValidationError {
  return new ValidationError(message, {
    errorCode: CLIENT_ERROR_CODES.VALIDATION,
  });
}

/**
 * Build the error of a field the method does not take.
 *
 * @param method - The method's name.
 * @param name - The field's name.
 * @returns The error.
 */
function unexpectedField(method: string, name: string): TypeError {
  return new TypeError(`${method}() got an unexpected field '${name}'`);
}

/**
 * Tell whether a value is a plain object, not a list.
 *
 * @param value - The value.
 * @returns True for an object that is not an array.
 */
function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Show a value in a message the way Python's repr would.
 *
 * @param value - The value.
 * @returns Text in single quotes, or the value as text.
 */
function shown(value: unknown): string {
  if (typeof value === "string") {
    return `'${value}'`;
  }
  if (typeof value === "object" && value !== null) {
    return kindOf(value);
  }
  return String(value);
}

/**
 * Name the kind of a value, for a message.
 *
 * @param value - The value.
 * @returns "array" for a list, otherwise the value's typeof.
 */
function kindOf(value: unknown): string {
  if (Array.isArray(value)) {
    return "array";
  }
  return value === null ? "null" : typeof value;
}
