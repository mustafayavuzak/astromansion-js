// PATH: examples/natal_chart.ts

/**
 * NATAL CHART: print a full natal chart from the AstroMansion API
 *
 * Usage:
 *   export ASTROMANSION_API_KEY="your key"
 *   node examples/natal_chart.ts
 *
 *   Node.js 24 runs this file as written. Edit BIRTH below for a different
 *   chart. The place is looked up through the API rather than typed by hand,
 *   so the coordinates come from the same source the calculation uses.
 */

import {
  AstroMansion,
  AstroMansionError,
  AuthenticationError,
  PermissionDeniedError,
  type JsonObject,
  type JsonValue,
  type Result,
} from "astromansion";

/** Change these for another chart. */
const BIRTH = Object.freeze({
  date: "2000-01-01", // YYYY-MM-DD
  time: "12:00", // HH:MM, leave the field out if the time is unknown
  lat: 51.4779, // decimal degrees, north positive
  lon: 0, // decimal degrees, east positive
  timezone: 0, // hours from UTC, or a name like "Europe/London"
});

/** How the program prints. */
const PRINT = Object.freeze({
  PLACE: "Royal Observatory, Greenwich",
  RULE_WIDTH: 58,
  NAME_WIDTH: 12,
  SIGN_WIDTH: 14,
  DEGREE_WIDTH: 14,
  HOUSE_WIDTH: 6,
  LOT_NAME_WIDTH: 24,
  SUMMARY_NAME_WIDTH: 6,
  ASPECT_WIDTH: 18,
  FAILURE: 1,
});

/**
 * Print a section's title and its rule.
 *
 * @param title - The section's title.
 */
function rule(title: string): void {
  console.log(`\n${title}`);
  console.log("-".repeat(PRINT.RULE_WIDTH));
}

/**
 * Write an offset from UTC, as Python's "{:+g}" writes it.
 *
 * @param hours - The offset in hours.
 * @returns The offset with its sign, such as UTC+0 or UTC-5.
 */
function utcOffset(hours: number): string {
  return `UTC${hours >= 0 ? "+" : ""}${String(hours)}`;
}

/**
 * Show one JSON value in a column.
 *
 * @param value - The value.
 * @returns The value as text, empty when there is none.
 */
function shown(value: JsonValue | undefined): string {
  if (value === undefined || value === null) {
    return "";
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * Tell whether a value is one row of a query's answer.
 *
 * @param value - The value.
 * @returns True for an object.
 */
function isRow(value: JsonValue): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Read the rows of a query's answer.
 *
 * @param answer - The answer, or the text of a rendered one.
 * @returns The rows, none for text.
 */
function rowsOf(answer: Result | string): readonly JsonObject[] {
  if (typeof answer === "string") {
    return [];
  }
  const data: JsonValue = answer.data;
  return Array.isArray(data) ? data.filter(isRow) : [];
}

/**
 * Print the chart.
 *
 * @returns The program's exit code.
 */
async function main(): Promise<number> {
  const client = new AstroMansion();

  // The API knows the place better than a guessed coordinate does.
  try {
    const found = await client.searchPlaces({
      q: "Greenwich",
      limit: 1,
      lang: "en",
    });
    const [first] = found.results;
    if (first !== undefined) {
      console.log(
        `Place: ${first.label}  (${String(first.lat)}, ${String(first.lon)})`,
      );
    }
  } catch (error: unknown) {
    if (!(error instanceof AstroMansionError)) {
      throw error;
    }
    console.log(`Place: ${PRINT.PLACE}`);
  }

  const chart = await client.natal(BIRTH);

  console.log(
    `Date: ${BIRTH.date} ${BIRTH.time}  ${utcOffset(BIRTH.timezone)}`,
  );

  rule("SUMMARY");
  for (const [name, point] of Object.entries(chart.summary)) {
    console.log(
      `  ${name.padEnd(PRINT.SUMMARY_NAME_WIDTH)}${point.sign.padEnd(PRINT.SIGN_WIDTH)}${point.dms}`,
    );
  }

  rule(`PLANETS (${String(chart.planets.length)})`);
  console.log(
    `  ${"".padEnd(PRINT.NAME_WIDTH)}${"SIGN".padEnd(PRINT.SIGN_WIDTH)}` +
      `${"DEGREE".padEnd(PRINT.DEGREE_WIDTH)}${"HOUSE".padEnd(PRINT.HOUSE_WIDTH)}STATE`,
  );
  for (const planet of chart.planets) {
    const state = planet.retrograde ? "R" : "";
    console.log(
      `  ${planet.name.padEnd(PRINT.NAME_WIDTH)}${shown(planet.sign).padEnd(PRINT.SIGN_WIDTH)}` +
        `${shown(planet.dms).padEnd(PRINT.DEGREE_WIDTH)}${shown(planet.house).padEnd(PRINT.HOUSE_WIDTH)}${state}`,
    );
  }

  rule(`ASPECTS (${String(chart.aspects.length)})`);
  if (chart.aspects.length === 0) {
    console.log("  (no aspect within this orb)");
  }
  for (const aspect of chart.aspects) {
    console.log(
      `  ${aspect.a.padEnd(PRINT.NAME_WIDTH)}${aspect.aspect.padEnd(PRINT.ASPECT_WIDTH)}` +
        `${aspect.b.padEnd(PRINT.NAME_WIDTH)}orb ${String(aspect.orb)}`,
    );
  }

  // Arabic lots come from the query surface rather than a named method.
  try {
    const lots = rowsOf(
      await client.query({ birth: BIRTH, sql: "SELECT * FROM lots" }),
    );
    rule(`ARABIC LOTS (${String(lots.length)})`);
    for (const lot of lots) {
      console.log(
        `  ${shown(lot["name"]).padEnd(PRINT.LOT_NAME_WIDTH)}${shown(lot["sign"]).padEnd(PRINT.SIGN_WIDTH)}` +
          `${shown(lot["dms"]).padEnd(PRINT.DEGREE_WIDTH)}house ${shown(lot["house"])}`,
      );
    }
  } catch (error: unknown) {
    if (!(error instanceof PermissionDeniedError)) {
      throw error;
    }
    rule("ARABIC LOTS");
    console.log("  Not included in this plan.");
  }

  return 0;
}

try {
  process.exitCode = await main();
} catch (error: unknown) {
  if (error instanceof AuthenticationError) {
    console.error(`Key problem: ${error.message}`);
    process.exitCode = PRINT.FAILURE;
  } else if (error instanceof AstroMansionError) {
    console.error(`API error (${String(error.statusCode)}): ${String(error)}`);
    process.exitCode = PRINT.FAILURE;
  } else {
    throw error;
  }
}
