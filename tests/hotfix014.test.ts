// PATH: tests/hotfix014.test.ts

/**
 * HOTFIX 0.1.4 TESTS: the Python SDK's tests/test_hotfix_0_1_4.py, case by case
 *
 * Purpose:
 *   The regressions a third-party review of the Python SDK's 0.1.3 measured.
 *   The JavaScript SDK never had the defects, and these tests keep it so: a
 *   path parameter reaches the URL, the key never leaves the API, a spent
 *   quota is not retried, and a partial catalog walk never looks complete.
 */

import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AstroMansion } from "../src/client.ts";
import { API_ENVIRONMENT } from "../src/models/constants/api.ts";
import { CATALOG_WALK } from "../src/models/constants/catalog.ts";
import {
  QuotaExceededError,
  RateLimitError,
  ServerError,
  ValidationError,
} from "../src/models/errors/api.ts";
import type { JsonValue } from "../src/models/records/json.ts";
import { FakeFetch, jsonAnswer, type ScriptedStep } from "./fakes/fetch.ts";

const BASE = "https://api.astromansion.com";
const KEY = "am_secret_key_0123456789";
const BIRTH = Object.freeze({ date: "2000-01-01", lat: 51.4779, lon: 0 });
const NATAL = Object.freeze({
  summary: {},
  planets: [],
  aspects: [],
}) satisfies JsonValue;
/** A custom body placed for a birth, in the shape the API publishes for it. */
const PLACED = Object.freeze({
  result: {
    body: {
      name: "ceres",
      lon: 120.5,
      lat: 1.25,
      sign: "Leo",
      dms: "0°30'",
      house: 5,
      speed: 0.25,
      retrograde: false,
      type: "custom",
    },
  },
}) satisfies JsonValue;

/**
 * Build a client over a script.
 *
 * @param steps - The answers the fetch gives, in order.
 * @param maxRetries - The retries the client allows.
 * @returns The client, and the fetch to read the calls from.
 */
function scripted(
  steps: readonly ScriptedStep[],
  maxRetries = 2,
): { readonly client: AstroMansion; readonly fake: FakeFetch } {
  const fake = new FakeFetch(steps);
  return {
    client: new AstroMansion({ apiKey: KEY, maxRetries, fetch: fake.fetch }),
    fake,
  };
}

beforeEach(() => {
  vi.stubEnv(API_ENVIRONMENT.KEY, "");
});

describe("a path parameter reaches the URL", () => {
  it("sends a named body to its own path", async () => {
    const { client, fake } = scripted([jsonAnswer(200, PLACED)]);

    await client.chartWithCustomBody("ceres", { birth: BIRTH });

    expect(fake.calls.at(-1)?.url).toBe(`${BASE}/v1/custom-body/ceres`);
  });

  it("keeps a slash in a name inside its segment", async () => {
    const { client, fake } = scripted([jsonAnswer(200, PLACED)]);

    await client.chartWithCustomBody("a/b c", { birth: BIRTH });

    expect(new URL(fake.calls.at(-1)?.url ?? BASE).pathname).toBe(
      "/v1/custom-body/a%2Fb%20c",
    );
  });

  it("leaves no placeholder in any generated path", async () => {
    const source = await readFile(
      new URL("../src/endpointMethods.ts", import.meta.url),
      "utf8",
    );

    const templates = source
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.startsWith('"/v1/') && line.includes("{"));
    expect(templates).toEqual([]);
  });
});

describe("the key never leaves the API", () => {
  it.each([
    "https://other.example/collect",
    "http://other.example/collect",
    "//other.example/collect",
    "/collect",
    "v1/natal",
    "/v2/natal",
  ])("refuses %s, which is not an API path", async (target) => {
    const { client } = scripted([]);

    await expect(client.request("GET", target)).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it("still reaches an API path this release does not name", async () => {
    const { client, fake } = scripted([jsonAnswer(200, { ok: true })]);

    await client.request("POST", "/v1/not-yet-named", { json: {} });

    expect(fake.calls.at(-1)?.url).toBe(`${BASE}/v1/not-yet-named`);
  });

  it("sends nothing at all toward another host", async () => {
    const { client, fake } = scripted([jsonAnswer(200, {})]);

    await expect(
      client.request("GET", "https://other.example/collect"),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(fake.calls).toHaveLength(0);
  });
});

describe("a spent quota is not a busy moment", () => {
  it("asks about a spent quota once", async () => {
    const { client, fake } = scripted([
      jsonAnswer(429, { error: { code: "quota_exceeded", message: "spent" } }),
    ]);

    await expect(client.natal(BIRTH)).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
    expect(fake.calls).toHaveLength(1);
  });

  it("still retries a real rate limit", async () => {
    const { client, fake } = scripted([
      jsonAnswer(
        429,
        { error: { code: "rate_limited" } },
        { "Retry-After": "0" },
      ),
      jsonAnswer(200, NATAL),
    ]);

    await client.natal(BIRTH);

    expect(fake.calls).toHaveLength(2);
  });

  it("still retries a server error", async () => {
    const { client, fake } = scripted([
      jsonAnswer(500, { error: { code: "server_error" } }),
      jsonAnswer(200, NATAL),
    ]);

    await client.natal(BIRTH);

    expect(fake.calls).toHaveLength(2);
  });

  it("still retries a rate limit without a body, since no code makes it permanent", async () => {
    const { client, fake } = scripted([
      { status: 429, body: "slow down", headers: { "Retry-After": "0" } },
      jsonAnswer(200, NATAL),
    ]);

    await client.natal(BIRTH);

    expect(fake.calls).toHaveLength(2);
  });

  it("raises the quota's error for a quota and the rate limit's for a rate limit", async () => {
    const quota = scripted(
      [jsonAnswer(429, { error: { code: "quota_exceeded" } })],
      0,
    );
    const rate = scripted(
      [jsonAnswer(429, { error: { code: "rate_limited" } })],
      0,
    );

    await expect(quota.client.natal(BIRTH)).rejects.toBeInstanceOf(
      QuotaExceededError,
    );
    await expect(rate.client.transits(BIRTH)).rejects.toBeInstanceOf(
      RateLimitError,
    );
  });
});

describe("a partial catalog walk never looks complete", () => {
  it("refuses a walk that never ends rather than truncating it", async () => {
    const pages = Array.from(
      { length: CATALOG_WALK.PAGE_CEILING },
      (_, index) =>
        jsonAnswer(200, {
          bodies: { fixed_stars: [{ name: "S" }] },
          catalog_page: { next_offset: (index + 1) * CATALOG_WALK.PAGE_MAX },
        }),
    );
    const { client, fake } = scripted(pages);

    await expect(client.bodies("fixed_stars", BIRTH)).rejects.toBeInstanceOf(
      ServerError,
    );
    expect(fake.calls).toHaveLength(CATALOG_WALK.PAGE_CEILING);
  });

  it("refuses a walk told to stand still", async () => {
    const { client, fake } = scripted([
      jsonAnswer(200, {
        bodies: { fixed_stars: [{ name: "S" }] },
        catalog_page: { next_offset: 0 },
      }),
    ]);

    await expect(client.bodies("fixed_stars", BIRTH)).rejects.toBeInstanceOf(
      ServerError,
    );
    expect(fake.calls).toHaveLength(1);
  });
});
