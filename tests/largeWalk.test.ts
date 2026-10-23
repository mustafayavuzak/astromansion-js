// PATH: tests/largeWalk.test.ts

/**
 * LARGE WALK TESTS: the Python SDK's tests/test_large_walk.py, case by case
 *
 * Purpose:
 *   A category too large to read by accident says so before it starts. A
 *   program that prints nothing for a minute cannot be told apart from one
 *   that has hung.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AstroMansion } from "../src/client.ts";
import { API_ENVIRONMENT } from "../src/models/constants/api.ts";
import { CATALOG_WALK } from "../src/models/constants/catalog.ts";
import { ValidationError } from "../src/models/errors/api.ts";
import type { JsonValue } from "../src/models/records/json.ts";
import { FakeFetch, jsonAnswer } from "./fakes/fetch.ts";

const KEY = "am_test_key_0123456789";
const BIRTH = Object.freeze({ date: "2000-01-01", lat: 51.4779, lon: 0 });
const PAGE_ROWS = 160;

/**
 * Build one page of asteroids.
 *
 * @param total - The total the page states.
 * @param following - The next offset, or null for the last page.
 * @returns The page.
 */
function page(total: number, following: number | null): JsonValue {
  return {
    bodies: {
      asteroids: Array.from({ length: PAGE_ROWS }, (_, index) => ({
        name: `a${String(index)}`,
      })),
    },
    catalog_page: {
      offset: 0,
      limit: PAGE_ROWS,
      total,
      next_offset: following,
    },
  };
}

/**
 * Build a client over pages.
 *
 * @param pages - The pages, in order.
 * @returns The client, and the fetch to read the calls from.
 */
function serving(pages: readonly JsonValue[]): {
  readonly client: AstroMansion;
  readonly fake: FakeFetch;
} {
  const fake = new FakeFetch(pages.map((answer) => jsonAnswer(200, answer)));
  return { client: new AstroMansion({ apiKey: KEY, fetch: fake.fetch }), fake };
}

beforeEach(() => {
  vi.stubEnv(API_ENVIRONMENT.KEY, "");
});

describe("a category too large to read by accident", () => {
  it("stops a walk of twenty-eight thousand bodies after one request and names its size", async () => {
    const { client, fake } = serving([page(28199, PAGE_ROWS)]);

    const walk = client.bodies("asteroids", BIRTH);

    await expect(walk).rejects.toBeInstanceOf(ValidationError);
    await expect(walk).rejects.toThrow(/28199/);
    await expect(walk).rejects.toThrow(/177/);
    expect(fake.calls).toHaveLength(1);
  });

  it("reads it anyway when confirmed", async () => {
    const { client } = serving([page(320, PAGE_ROWS), page(320, null)]);

    const found = await client.bodies("asteroids", {
      ...BIRTH,
      confirmLarge: true,
    });

    expect(found["asteroids"]).toHaveLength(320);
  });

  it("needs no confirmation for a category that fits", async () => {
    const { client } = serving([page(890, PAGE_ROWS), page(890, null)]);

    const found = await client.bodies("asteroids", BIRTH);

    expect(found["asteroids"]).toHaveLength(320);
  });

  it("walks as many requests as the limit allows, and refuses one more", async () => {
    const most = CATALOG_WALK.WALK_WARN_REQUESTS * PAGE_ROWS;
    const fits = serving([page(most, null)]);
    const over = serving([page(most + 1, null)]);

    const found = await fits.client.bodies("asteroids", BIRTH);

    expect(found["asteroids"]).toHaveLength(PAGE_ROWS);
    await expect(over.client.bodies("asteroids", BIRTH)).rejects.toThrow(
      ValidationError,
    );
  });

  it("reports the progress page by page", async () => {
    const { client } = serving([
      page(28199, PAGE_ROWS),
      page(28199, 2 * PAGE_ROWS),
      page(28199, null),
    ]);
    const seen: (readonly [number, number, number])[] = [];

    await client.bodies("asteroids", {
      ...BIRTH,
      confirmLarge: true,
      onPage: (done, left, rows) => {
        seen.push([done, left, rows["asteroids"]?.length ?? 0]);
      },
    });

    expect(seen.map((row) => row[0])).toEqual([1, 2, 3]);
    expect(seen[0]?.[1]).toBe(176);
    expect(seen.map((row) => row[2])).toEqual([160, 320, 480]);
  });
});
