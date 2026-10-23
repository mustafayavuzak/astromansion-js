// PATH: tests/catalogPages.test.ts

/**
 * CATALOG PAGES TESTS: the Python SDK's tests/test_catalog_pages.py, case by case
 *
 * Purpose:
 *   Reading a whole catalog category, however many pages it takes. Python
 *   also walks the same pages with its asynchronous client, and JavaScript
 *   has the one asynchronous client.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AstroMansion } from "../src/client.ts";
import { API_ENVIRONMENT } from "../src/models/constants/api.ts";
import { ValidationError } from "../src/models/errors/api.ts";
import type { JsonValue } from "../src/models/records/json.ts";
import { isJsonObject } from "../src/responses/json.ts";
import { FakeFetch, jsonAnswer } from "./fakes/fetch.ts";

const KEY = "am_test_key_0123456789";
const BIRTH = Object.freeze({
  date: "2000-01-01",
  time: "12:00",
  lat: 51.4779,
  lon: 0,
  timezone: 3,
});

/**
 * Measured against the live API at catalog_limit 10: the chart's own bodies
 * fill the window first, so the opening page carries no star at all and the
 * fixed_stars key is simply absent.
 */
const PAGES: readonly JsonValue[] = [
  {
    bodies: { planets: Array.from({ length: 10 }, () => ({ name: "Sun" })) },
    catalog_page: { offset: 0, total: 25, next_offset: 10 },
  },
  {
    bodies: {
      points: Array.from({ length: 5 }, () => ({ name: "Asc" })),
      fixed_stars: Array.from({ length: 5 }, (_, index) => ({
        name: `S${String(index)}`,
      })),
    },
    catalog_page: { offset: 10, total: 25, next_offset: 20 },
  },
  {
    bodies: {
      fixed_stars: Array.from({ length: 5 }, (_, index) => ({
        name: `T${String(index)}`,
      })),
    },
    catalog_page: { offset: 20, total: 25, next_offset: null },
  },
];
const STARS = ["S0", "S1", "S2", "S3", "S4", "T0", "T1", "T2", "T3", "T4"];

/**
 * Build a client that answers each request with the next page.
 *
 * @param pages - The pages, in order.
 * @returns The client, and the fetch to read the calls from.
 */
function serving(pages: readonly JsonValue[]): {
  readonly client: AstroMansion;
  readonly fake: FakeFetch;
} {
  const fake = new FakeFetch(pages.map((page) => jsonAnswer(200, page)));
  return { client: new AstroMansion({ apiKey: KEY, fetch: fake.fetch }), fake };
}

/**
 * Read the name of every row.
 *
 * @param rows - The rows a walk gathered.
 * @returns Their names.
 */
function names(rows: readonly JsonValue[] | undefined): readonly unknown[] {
  return (rows ?? []).map((row): unknown =>
    isJsonObject(row) ? row["name"] : undefined,
  );
}

/**
 * Read one request's body.
 *
 * @param fake - The fetch.
 * @param index - The request's place, from zero.
 * @returns The body, parsed.
 */
function sentBody(fake: FakeFetch, index: number): unknown {
  return JSON.parse(fake.calls[index]?.body ?? "null");
}

beforeEach(() => {
  vi.stubEnv(API_ENVIRONMENT.KEY, "");
});

describe("walking a catalog category", () => {
  it("follows every page to the end", async () => {
    const { client, fake } = serving(PAGES);

    const found = await client.bodies("fixed_stars", BIRTH);

    expect(names(found["fixed_stars"])).toEqual(STARS);
    expect(fake.calls).toHaveLength(PAGES.length);
  });

  it("takes a page holding none of the category as ordinary", async () => {
    const { client } = serving(PAGES);

    const found = await client.bodies("fixed_stars", BIRTH);

    expect(found["fixed_stars"]).toHaveLength(10);
  });

  it("asks each request for the largest page the API serves", async () => {
    const { client, fake } = serving(PAGES);

    await client.bodies("fixed_stars", BIRTH);

    expect(sentBody(fake, 0)).toMatchObject({
      options: { catalog_limit: 160 },
    });
  });

  it("takes the offsets from the API rather than counting them here", async () => {
    const { client, fake } = serving(PAGES);

    await client.bodies("fixed_stars", BIRTH);

    expect([0, 1, 2].map((index) => sentBody(fake, index))).toMatchObject([
      { options: { catalog_offset: 0 } },
      { options: { catalog_offset: 10 } },
      { options: { catalog_offset: 20 } },
    ]);
  });

  it("reads several categories in one walk", async () => {
    const { client, fake } = serving([
      {
        bodies: { fixed_stars: [{ name: "S" }], arabic_lots: [{ name: "L" }] },
        catalog_page: { next_offset: null },
      },
    ]);

    const found = await client.bodies("fixed_stars", "arabic_lots", BIRTH);

    expect(new Set(Object.keys(found))).toEqual(
      new Set(["fixed_stars", "arabic_lots"]),
    );
    expect(fake.calls).toHaveLength(1);
  });

  it("returns the same shape whatever the number of categories", async () => {
    const { client } = serving(PAGES);

    const found = await client.bodies("fixed_stars", BIRTH);

    expect(Object.keys(found)).toEqual(["fixed_stars"]);
  });

  it("refuses a walk without a category before the network", async () => {
    const { client, fake } = serving([]);

    await expect(client.bodies(BIRTH)).rejects.toBeInstanceOf(ValidationError);
    expect(fake.calls).toHaveLength(0);
  });

  it.each([0, -1, 161, 1000])(
    "refuses the page size %i, which the API would refuse",
    async (size) => {
      const { client, fake } = serving([]);

      await expect(
        client.bodies("fixed_stars", { ...BIRTH, pageSize: size }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(fake.calls).toHaveLength(0);
    },
  );

  it("ends the walk at a page without a next offset", async () => {
    const { client, fake } = serving([
      { bodies: { fixed_stars: [{ name: "S" }] } },
    ]);

    const found = await client.bodies("fixed_stars", BIRTH);

    expect(fake.calls).toHaveLength(1);
    expect(found["fixed_stars"]).toHaveLength(1);
  });
});
