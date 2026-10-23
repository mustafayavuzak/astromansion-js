// PATH: src/models/constants/catalog.ts

/**
 * CATALOG CONSTANTS: paging the /v1/chart catalog
 *
 * Purpose:
 *   A page costs one round trip and the calculation inside it is a rounding
 *   error beside that, so the only sensible page is the largest the API
 *   serves, PAGE_MAX. Reading the 906 unambiguous fixed-star targets is six
 *   requests at this size and 182 at five.
 *
 *   PAGE_CEILING stops a walk whose answers never end. The API ends a walk
 *   with a null next offset, so only a malformed answer reaches it.
 *
 *   WALK_WARN_REQUESTS is the number of requests a walk may need before it
 *   stops after the first page and names the size. asteroids holds
 *   twenty-eight thousand bodies, 177 round trips with nothing printed until
 *   the last one lands. Reading it is reasonable to want and terrible to
 *   start by accident.
 */

/**
 * Where a catalog walk reads and how far it may go.
 *
 * @internal
 */
export const CATALOG_WALK = Object.freeze({
  PATH: "/v1/chart",
  TECHNIQUE: "chart",
  PAGE_MAX: 160,
  PAGE_CEILING: 200,
  WALK_WARN_REQUESTS: 12,
} as const);

/**
 * The request options and answer fields a walk reads and writes, as the API names them.
 *
 * @internal
 */
export const CATALOG_FIELDS = Object.freeze({
  CATEGORIES: "categories",
  OFFSET: "catalog_offset",
  LIMIT: "catalog_limit",
  BODIES: "bodies",
  PAGE: "catalog_page",
  NEXT_OFFSET: "next_offset",
  TOTAL: "total",
} as const);
