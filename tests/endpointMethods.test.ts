// PATH: tests/endpointMethods.test.ts

/**
 * ENDPOINT METHOD TESTS: every published operation has its method, and each kind of method sends and reads as its schema says
 */

import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readOpenApi } from "../.meta/tools/generate/openApi.ts";
import { camelName } from "../.meta/tools/generate/operations.ts";
import { AstroMansion } from "../src/client.ts";
import { EndpointMethods } from "../src/endpointMethods.ts";
import { API_ADDRESS, API_ENVIRONMENT } from "../src/models/constants/api.ts";
import { CLIENT_ERROR_CODES } from "../src/models/constants/errors.ts";
import { AstroMansionError } from "../src/models/errors/api.ts";
import type { JsonValue } from "../src/models/records/json.ts";
import { FakeFetch, jsonAnswer } from "./fakes/fetch.ts";
import { GREENWICH_BIRTH, ISSUED_KEY } from "./fixtures.ts";

/** The snapshot the methods were generated from. */
const SNAPSHOT = readOpenApi(
  await readFile(
    new URL("../.meta/openapi/openapi.v1.json", import.meta.url),
    "utf8",
  ),
);

/** A natal answer with every member NatalResponse requires. */
const NATAL_ANSWER = {
  summary: { Sun: { sign: "Capricorn", dms: "10°22'" } },
  planets: [
    {
      name: "Sun",
      sign: "Capricorn",
      dms: "10°22'",
      house: 10,
      retrograde: false,
    },
  ],
  aspects: [{ a: "Sun", b: "Moon", aspect: "trine", orb: 1.2 }],
} as const;

/**
 * Build a client over a script, with retries off so no test waits.
 *
 * @param fake - The fetch the client calls.
 * @returns The client.
 */
function clientOver(fake: FakeFetch): AstroMansion {
  return new AstroMansion({
    apiKey: ISSUED_KEY,
    maxRetries: 0,
    fetch: fake.fetch,
  });
}

/**
 * Read the one call a fake received.
 *
 * @param fake - The fake.
 * @returns The call's URL, method, and body as JSON.
 */
function onlyCall(fake: FakeFetch): {
  readonly url: string;
  readonly method: string | undefined;
  readonly body: unknown;
} {
  expect(fake.calls).toHaveLength(1);
  const [call] = fake.calls;
  if (call === undefined) {
    throw new Error("no call was recorded");
  }
  return {
    url: call.url,
    method: call.method,
    body: call.body === undefined ? undefined : JSON.parse(call.body),
  };
}

/**
 * Catch the failure of a call, for its fields.
 *
 * @param call - The call expected to reject.
 * @returns The error it rejected with.
 */
async function failureOf(
  call: () => Promise<unknown>,
): Promise<AstroMansionError> {
  try {
    await call();
  } catch (error) {
    if (error instanceof AstroMansionError) {
      return error;
    }
    throw error;
  }
  throw new Error("the call resolved where it should have rejected");
}

beforeEach(() => {
  vi.stubEnv(API_ENVIRONMENT.KEY, "");
  vi.stubEnv(API_ENVIRONMENT.BASE_URL, "");
});

describe("the methods", () => {
  const names = SNAPSHOT.operations.map((operation) =>
    camelName(operation.operationId),
  );

  it("include one method for every operation the snapshot publishes", () => {
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(typeof Reflect.get(AstroMansion.prototype, name)).toBe("function");
    }
  });

  it("hold no method beyond the published operations", () => {
    const own = Object.getOwnPropertyNames(EndpointMethods.prototype).filter(
      (name) => name !== "constructor",
    );
    expect(own.sort()).toEqual([...names].sort());
  });
});

describe("a method with a JSON answer", () => {
  it("sends its body and returns the answer once it has its shape", async () => {
    const fake = new FakeFetch([jsonAnswer(200, NATAL_ANSWER)]);

    const chart = await clientOver(fake).natal({ birth: GREENWICH_BIRTH });

    expect(chart).toEqual(NATAL_ANSWER);
    expect(onlyCall(fake)).toEqual({
      url: `${API_ADDRESS.BASE_URL}/v1/natal`,
      method: "POST",
      body: { birth: GREENWICH_BIRTH },
    });
  });

  it("refuses an answer that misses a required member, keeping it as the details", async () => {
    const partial = {
      summary: NATAL_ANSWER.summary,
      planets: NATAL_ANSWER.planets,
    };
    const fake = new FakeFetch([jsonAnswer(200, partial)]);

    const failure = await failureOf(() =>
      clientOver(fake).natal({ birth: GREENWICH_BIRTH }),
    );

    expect(failure.errorCode).toBe(CLIENT_ERROR_CODES.UNEXPECTED_ANSWER);
    expect(failure.details).toEqual(partial);
  });

  it("reads a member it does not know, and a value a closed set gained, without failing", async () => {
    const status = {
      id: "j1",
      state: "cancelled",
      technique: "transits",
      kind: "single",
      result: null,
      error: null,
      created_at: "2026-10-23T09:00:00Z",
      finished_at: null,
      webhook: null,
      attempts: 2,
    };
    const fake = new FakeFetch([jsonAnswer(200, status)]);

    const job = await clientOver(fake).job("j1");

    expect(job.state).toBe("cancelled");
  });

  it("escapes a path argument into its segment", async () => {
    const fake = new FakeFetch([
      jsonAnswer(404, { error: { code: "not_found" } }),
    ]);

    await failureOf(() => clientOver(fake).job("a/b"));

    expect(onlyCall(fake).url).toBe(`${API_ADDRESS.BASE_URL}/v1/jobs/a%2Fb`);
  });

  it("sends its query as parameters", async () => {
    const places = {
      results: [
        {
          name: "London",
          label: "London, United Kingdom",
          lat: 51.5074,
          lon: -0.1278,
          timezone: "Europe/London",
        },
      ],
    };
    const fake = new FakeFetch([jsonAnswer(200, places)]);

    const found = await clientOver(fake).searchPlaces({ q: "Lon", limit: 3 });

    expect(found).toEqual(places);
    expect(onlyCall(fake)).toMatchObject({
      url: `${API_ADDRESS.BASE_URL}/v1/geo/search?q=Lon&limit=3`,
      method: "GET",
    });
  });

  it("reads a list of a union, member by member", async () => {
    const batch = {
      count: 2,
      results: [
        { technique: "natal", ok: true, result: { sun: "Capricorn" } },
        { technique: "transits", ok: false, error: { code: "forbidden" } },
      ],
    };
    const fake = new FakeFetch([jsonAnswer(200, batch)]);

    const answer = await clientOver(fake).batch({ items: [] });

    expect(answer.results.map((item) => item.ok)).toEqual([true, false]);
  });

  it.each<[string, JsonValue]>([
    [
      "a batch item that is neither answered nor refused",
      { count: 1, results: [{ technique: "natal", ok: "yes" }] },
    ],
    ["a batch without its results", { count: 0 }],
  ])("refuses %s", async (_case, answer) => {
    const fake = new FakeFetch([jsonAnswer(200, answer)]);

    const failure = await failureOf(() =>
      clientOver(fake).batch({ items: [] }),
    );

    expect(failure.errorCode).toBe(CLIENT_ERROR_CODES.UNEXPECTED_ANSWER);
  });
});

describe("a method whose answer is a wrapper", () => {
  it("returns the result inside it", async () => {
    const fake = new FakeFetch([
      jsonAnswer(200, { technique: "transits", result: { hits: [] } }),
    ]);

    const result = await clientOver(fake).transits({ birth: GREENWICH_BIRTH });

    expect(result).toEqual({ hits: [] });
  });
});

describe("a method whose answer is a document", () => {
  it("returns the document's bytes", async () => {
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
    const fake = new FakeFetch([
      { status: 200, body: png, headers: { "Content-Type": "image/png" } },
    ]);

    const image = await clientOver(fake).renderPng({ birth: GREENWICH_BIRTH });

    expect(image).toEqual(png);
    expect(onlyCall(fake).url).toBe(`${API_ADDRESS.BASE_URL}/v1/render/png`);
  });
});

describe("a method's options", () => {
  it("stop the call before the network when the signal has aborted", async () => {
    const fake = new FakeFetch([jsonAnswer(200, NATAL_ANSWER)]);
    const controller = new AbortController();
    controller.abort(new Error("the page closed"));

    await expect(
      clientOver(fake).natal(
        { birth: GREENWICH_BIRTH },
        { signal: controller.signal },
      ),
    ).rejects.toThrow("the page closed");
    expect(fake.calls).toHaveLength(0);
  });
});
