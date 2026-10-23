// PATH: src/catalogPages.ts

/**
 * CATALOG PAGES: walking the paginated /v1/chart catalog
 *
 * Purpose:
 *   The arithmetic of a catalog walk, so the client owns only the calls:
 *
 *     page 1 ──► options(offset 0)   ──► absorb ──► next offset ─┐
 *                                     guardSize (first page)      │
 *     page n ──► options(offset n)   ──► absorb ──► none ──► done ◄┘
 *     after PAGE_CEILING pages       ──► exhausted() is thrown
 *
 *   The offsets come from the API's answers, never counted here, and an
 *   answer that tells the walk to stand still or go back ends it with an
 *   error rather than reading one page forever.
 */

import { CATALOG_FIELDS, CATALOG_WALK } from "./models/constants/catalog.ts";
import { CLIENT_ERROR_CODES } from "./models/constants/errors.ts";
import { ServerError, ValidationError } from "./models/errors/api.ts";
import type { JsonObject, JsonValue } from "./models/records/json.ts";
import { isJsonArrayOf, isJsonObject } from "./responses/json.ts";

/**
 * Build each page's request and read each page's answer.
 *
 * @internal
 */
export const CatalogPages = Object.freeze({
  options,
  absorb,
  totalOf,
  remaining,
  guardSize,
  exhausted,
});

/**
 * Build the chart options of one page of a catalog walk.
 *
 * @param categories - The category keys to read.
 * @param base - The caller's own options, which every page carries.
 * @param offset - The zero-based offset of this page.
 * @param limit - The bodies this page asks for, within 1..PAGE_MAX.
 * @returns The options of one request.
 * @throws {@link ValidationError} when no category was named, or the page size is out of the range the API serves.
 *
 * @example
 * ```ts
 * options(["fixed_stars"], { houses: "whole" }, 160, 160);
 * // { houses: "whole", categories: ["fixed_stars"], catalog_offset: 160, catalog_limit: 160 }
 * ```
 */
function options(
  categories: readonly string[],
  base: JsonObject | undefined,
  offset: number,
  limit: number,
): JsonObject {
  if (categories.length === 0) {
    throw new ValidationError(
      'name at least one category, for example "fixed_stars"',
      { errorCode: CLIENT_ERROR_CODES.VALIDATION },
    );
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > CATALOG_WALK.PAGE_MAX) {
    throw new ValidationError(
      `pageSize must be within 1..${String(CATALOG_WALK.PAGE_MAX)}, got ${String(limit)}`,
      { errorCode: CLIENT_ERROR_CODES.VALIDATION },
    );
  }
  return {
    ...base,
    [CATALOG_FIELDS.CATEGORIES]: [...categories],
    [CATALOG_FIELDS.OFFSET]: offset,
    [CATALOG_FIELDS.LIMIT]: limit,
  };
}

/**
 * Take one page's rows and report where the next page begins.
 *
 * @remarks
 * A category is missing from bodies whenever the page held none of it,
 * which is ordinary. The page is a window over the whole selection, and the
 * chart's own bodies fill the first of it.
 *
 * @param page - The page's data.
 * @param collected - The rows gathered so far, by the categories asked for. This page's rows are appended.
 * @param offset - The offset this page was asked for.
 * @returns The offset of the next page, or undefined when the walk is over.
 * @throws {@link ServerError} when the answer tells the walk to stand still or go back, which would read the same page forever.
 */
function absorb(
  page: JsonValue,
  collected: Readonly<Record<string, JsonValue[]>>,
  offset: number,
): number | undefined {
  const bodies = isJsonObject(page) ? page[CATALOG_FIELDS.BODIES] : undefined;
  for (const [name, rows] of Object.entries(collected)) {
    const found = isJsonObject(bodies) ? bodies[name] : undefined;
    if (isJsonArrayOf(found)) {
      rows.push(...found);
    }
  }
  const following = pagingOf(page)[CATALOG_FIELDS.NEXT_OFFSET];
  if (typeof following !== "number" || !Number.isInteger(following)) {
    return undefined;
  }
  if (following <= offset) {
    throw new ServerError(
      `the API asked the catalog walk to go back to offset ${String(following)} from ${String(offset)}, which would never end`,
      { errorCode: CLIENT_ERROR_CODES.PAGINATION },
    );
  }
  return following;
}

/**
 * Return how many bodies the whole selection holds.
 *
 * @param page - The page's data.
 * @returns The total the page states, or zero when it states none.
 */
function totalOf(page: JsonValue): number {
  const total = pagingOf(page)[CATALOG_FIELDS.TOTAL];
  return typeof total === "number" && Number.isInteger(total) ? total : 0;
}

/**
 * Return how many requests the walk still expects after this page.
 *
 * @param page - The page's data.
 * @param limit - The bodies per request.
 * @returns The requests still needed, or zero when the page ends the walk or states no total.
 *
 * @example
 * ```ts
 * remaining({ catalog_page: { total: 28199, next_offset: 160 } }, 160);   // 176
 * ```
 */
function remaining(page: JsonValue, limit: number): number {
  const following = pagingOf(page)[CATALOG_FIELDS.NEXT_OFFSET];
  const total = totalOf(page);
  if (
    typeof following !== "number" ||
    !Number.isInteger(following) ||
    total <= 0 ||
    limit <= 0
  ) {
    return 0;
  }
  return Math.max(0, Math.ceil((total - following) / limit));
}

/**
 * Stop a walk far larger than a caller is likely to want.
 *
 * @remarks
 * Nothing here is slow or broken, and the walk would finish. But a walk
 * that prints nothing for a minute cannot be told apart from a hung
 * program, and saying the number is cheaper than letting somebody find out.
 *
 * @param page - The first page's data.
 * @param limit - The bodies per request.
 * @param categories - The categories being read, named in the message.
 * @throws {@link ValidationError} when the walk would take more than WALK_WARN_REQUESTS requests.
 */
function guardSize(
  page: JsonValue,
  limit: number,
  categories: readonly string[],
): void {
  const total = totalOf(page);
  if (limit <= 0) {
    return;
  }
  const requests = Math.ceil(total / limit);
  if (requests <= CATALOG_WALK.WALK_WARN_REQUESTS) {
    return;
  }
  throw new ValidationError(
    `${categories.join(", ")} holds ${String(total)} bodies, which is ` +
      `${String(requests)} requests and will print nothing until the last one ` +
      "lands. Pass confirmLarge: true to read it, onPage to watch " +
      "it arrive, or call chart() for a single page.",
    { errorCode: CLIENT_ERROR_CODES.VALIDATION },
  );
}

/**
 * Return the error of a walk that passed PAGE_CEILING pages.
 *
 * @remarks
 * Returning what was read would look complete while missing the rest, so
 * the walk fails instead.
 *
 * @returns The error for the client to throw.
 */
function exhausted(): ServerError {
  return new ServerError(
    `the catalog walk passed ${String(CATALOG_WALK.PAGE_CEILING)} pages without ` +
      "reaching the end. Returning what was read would look complete " +
      "while missing the rest.",
    { errorCode: CLIENT_ERROR_CODES.PAGINATION },
  );
}

/**
 * Return a page's catalog_page block, empty when it has none.
 *
 * @param page - The page's data.
 * @returns The block, or an empty object.
 */
function pagingOf(page: JsonValue): JsonObject {
  const paging = isJsonObject(page) ? page[CATALOG_FIELDS.PAGE] : undefined;
  return isJsonObject(paging) ? paging : {};
}
