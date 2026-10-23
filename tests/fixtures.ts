// PATH: tests/fixtures.ts

/**
 * FIXTURES: the values several test modules share
 *
 * Purpose:
 *   A value two test modules need is written once, here, in the lowest
 *   directory they share, and never declared again in either of them.
 */

/** A key shaped like the ones the API issues: the am_ prefix and 32 URL-safe characters. */
export const ISSUED_KEY = "am_Zx81qP0vT3kL9mN2bC7dE4fG6hJ1sR5w";

/** A birth at Greenwich, the place the Python SDK's examples use. */
export const GREENWICH_BIRTH = Object.freeze({
  date: "2000-01-01",
  time: "12:00",
  lat: 51.4779,
  lon: 0,
  timezone: "Europe/London",
} as const);

/** An API root that is not production, for tests that set the root. */
export const STAGING_ROOT = "https://staging.example.test";
