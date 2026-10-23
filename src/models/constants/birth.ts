// PATH: src/models/constants/birth.ts

/**
 * BIRTH CONSTANTS: the birth fields the API accepts, and how they are checked
 *
 * Purpose:
 *   A birth is checked before the request, so an error names the field the
 *   caller wrote rather than a JSON path the client built for them. The
 *   patterns check the shape only. The API checks that a date or a time
 *   exists.
 */

/**
 * The names of the birth object's fields, which are also the fields every chart method takes.
 *
 * @internal
 */
export const BIRTH_FIELDS = Object.freeze({
  DATE: "date",
  TIME: "time",
  LAT: "lat",
  LON: "lon",
  TIMEZONE: "timezone",
  HOUSES: "houses",
} as const);

/**
 * Every birth field name, to tell a birth field apart from an endpoint's own options.
 *
 * @internal
 */
export const BIRTH_FIELD_NAMES: readonly string[] = Object.freeze(
  Object.values(BIRTH_FIELDS),
);

/**
 * The ranges of the coordinates, in decimal degrees, north and east positive, both ends included.
 *
 * @internal
 */
export const BIRTH_LIMITS = Object.freeze({
  LAT_MIN_DEGREES: -90,
  LAT_MAX_DEGREES: 90,
  LON_MIN_DEGREES: -180,
  LON_MAX_DEGREES: 180,
} as const);

/**
 * The shapes of the birth's text fields.
 *
 * @internal
 */
export const BIRTH_PATTERNS = Object.freeze({
  /**
   * A calendar date written `YYYY-MM-DD`.
   *
   * Drawing:
   *
   * ```text
   * ^ \d{4} - \d{2} - \d{2} $
   *   year    month   day
   * ```
   *
   * Accepts: `2000-01-01`, `1990-07-19`
   * Refuses: `2000-1-1`, `01-01-2000`, `2000-01-01T12:00`
   */
  DATE: /^\d{4}-\d{2}-\d{2}$/,
  /**
   * A clock time written `HH:MM`, with optional seconds.
   *
   * Drawing:
   *
   * ```text
   * ^ \d{1,2} : \d{2} (:\d{2})? $
   *   hour      minute  seconds
   * ```
   *
   * Accepts: `12:00`, `9:05`, `23:59:30`
   * Refuses: `1200`, `12:0`, `12:00 PM`
   */
  TIME: /^\d{1,2}:\d{2}(:\d{2})?$/,
} as const);
