// PATH: tests/client.test.ts

/**
 * CLIENT TESTS: building a client, calling request(), and keeping the key out of sight
 */

import { inspect } from "node:util";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AstroMansion } from "../src/client.ts";
import {
  API_ADDRESS,
  API_ENVIRONMENT,
  API_HEADERS,
  KEY_MASK,
} from "../src/models/constants/api.ts";
import { CLIENT_ERROR_CODES } from "../src/models/constants/errors.ts";
import {
  AstroMansionError,
  AuthenticationError,
  NotFoundError,
  ValidationError,
} from "../src/models/errors/api.ts";
import { FakeFetch, jsonAnswer } from "./fakes/fetch.ts";
import { GREENWICH_BIRTH, ISSUED_KEY, STAGING_ROOT } from "./fixtures.ts";

/** A key the environment holds in the tests that set one. */
const ENVIRONMENT_KEY = "am_EnvironmentKeyEnvironmentKey00";

/**
 * Build a client over a script, with retries off so no test waits.
 *
 * @param fake - The fetch the client calls.
 * @param options - Further options.
 * @returns The client.
 */
function clientOver(
  fake: FakeFetch,
  options: ConstructorParameters<typeof AstroMansion>[0] = {},
): AstroMansion {
  return new AstroMansion({
    apiKey: ISSUED_KEY,
    maxRetries: 0,
    fetch: fake.fetch,
    ...options,
  });
}

beforeEach(() => {
  vi.stubEnv(API_ENVIRONMENT.KEY, "");
  vi.stubEnv(API_ENVIRONMENT.BASE_URL, "");
});

describe("building a client", () => {
  it("refuses to build without a key, before reaching the network", () => {
    const fake = new FakeFetch([]);

    expect(() => new AstroMansion({ fetch: fake.fetch })).toThrow(
      AuthenticationError,
    );
    expect(fake.calls).toHaveLength(0);
  });

  it("reads the key from the environment when the options name none", async () => {
    vi.stubEnv(API_ENVIRONMENT.KEY, ENVIRONMENT_KEY);
    const fake = new FakeFetch([jsonAnswer(200, {})]);

    await new AstroMansion({ maxRetries: 0, fetch: fake.fetch }).request(
      "GET",
      "/v1/health",
    );

    expect(fake.calls[0]?.headers.get(API_HEADERS.KEY)).toBe(ENVIRONMENT_KEY);
  });

  it("prefers the option's key over the environment's", async () => {
    vi.stubEnv(API_ENVIRONMENT.KEY, ENVIRONMENT_KEY);
    const fake = new FakeFetch([jsonAnswer(200, {})]);

    await clientOver(fake).request("GET", "/v1/health");

    expect(fake.calls[0]?.headers.get(API_HEADERS.KEY)).toBe(ISSUED_KEY);
  });

  it("sends no key as a visitor", async () => {
    const fake = new FakeFetch([jsonAnswer(200, {})]);

    await clientOver(fake, { apiKey: undefined, requireKey: false }).request(
      "GET",
      "/v1/health",
    );

    expect(fake.calls[0]?.headers.has(API_HEADERS.KEY)).toBe(false);
  });

  it("uses the root from the options, without its trailing slash", async () => {
    const fake = new FakeFetch([jsonAnswer(200, {})]);
    const client = clientOver(fake, { baseUrl: `${STAGING_ROOT}/` });

    await client.request("GET", "/v1/health");

    expect(client.baseUrl).toBe(STAGING_ROOT);
    expect(fake.calls[0]?.url).toBe(`${STAGING_ROOT}/v1/health`);
  });

  it("counts a negative retry count as zero", () => {
    expect(clientOver(new FakeFetch([]), { maxRetries: -3 }).maxRetries).toBe(
      0,
    );
  });

  it.each([
    ["a zero timeout", { timeoutMs: 0 }],
    ["a negative timeout", { timeoutMs: -1 }],
    ["a timeout that is not a number", { timeoutMs: Number.NaN }],
    ["an endless timeout", { timeoutMs: Number.POSITIVE_INFINITY }],
    ["a retry count that is not a number", { maxRetries: Number.NaN }],
  ])("refuses %s", (_case, options) => {
    expect(() => clientOver(new FakeFetch([]), options)).toThrow(
      ValidationError,
    );
  });
});

describe("request", () => {
  it("posts the JSON body to the API and opens the answer's wrapper", async () => {
    const result = { summary: { Sun: { sign: "Capricorn" } } };
    const fake = new FakeFetch([
      jsonAnswer(200, { technique: "natal", result }),
    ]);

    const answer = await clientOver(fake).request("POST", "/v1/natal", {
      json: { birth: GREENWICH_BIRTH },
    });

    expect(answer).toEqual(result);
    expect(fake.calls[0]).toMatchObject({
      url: `${API_ADDRESS.BASE_URL}/v1/natal`,
      method: "POST",
      body: JSON.stringify({ birth: GREENWICH_BIRTH }),
    });
  });

  it("turns a refusal into the error its status names", async () => {
    const fake = new FakeFetch([
      jsonAnswer(404, {
        error: { code: "not_found", message: "no such custom body" },
      }),
    ]);

    await expect(
      clientOver(fake).request("DELETE", "/v1/custom-body/Vulcan"),
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it("returns a document's bytes", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const fake = new FakeFetch([
      { status: 200, body: png, headers: { "Content-Type": "image/png" } },
    ]);

    const answer = await clientOver(fake).request("POST", "/v1/render/png", {
      json: { birth: GREENWICH_BIRTH },
      binary: true,
    });

    expect(answer).toEqual(png);
  });

  it.each([
    ["an absolute URL", "https://elsewhere.example/v1/natal"],
    ["a path outside /v1/", "/admin"],
  ])("refuses %s without calling fetch", async (_case, path) => {
    const fake = new FakeFetch([]);

    await expect(clientOver(fake).request("GET", path)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(fake.calls).toHaveLength(0);
  });

  it("refuses a body on a GET without calling fetch", async () => {
    const fake = new FakeFetch([]);

    await expect(
      clientOver(fake).request("GET", "/v1/eclipses", { json: { year: 2027 } }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(fake.calls).toHaveLength(0);
  });

  it("refuses a method the API does not publish", async () => {
    const fake = new FakeFetch([]);

    await expect(
      // @ts-expect-error -- a caller without type checks can pass any method
      clientOver(fake).request("PUT", "/v1/natal"),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("asks for a key on a call that needs one, even from a visitor client", async () => {
    const fake = new FakeFetch([]);
    const visitor = clientOver(fake, { apiKey: undefined, requireKey: false });

    await expect(
      visitor.request("GET", "/v1/custom-body/list", { requireKey: true }),
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(fake.calls).toHaveLength(0);
  });
});

describe("keeping the key out of sight", () => {
  it("shows the key masked in its description", () => {
    const head = ISSUED_KEY.slice(0, KEY_MASK.VISIBLE_PREFIX_CHARS);
    const tail = ISSUED_KEY.slice(-KEY_MASK.VISIBLE_SUFFIX_CHARS);

    expect(String(clientOver(new FakeFetch([])))).toBe(
      `AstroMansion(baseUrl=${API_ADDRESS.BASE_URL}, apiKey=${head}${KEY_MASK.ELLIPSIS}${tail})`,
    );
  });

  it.each([
    ["String()", (client: AstroMansion): string => String(client)],
    [
      "JSON.stringify()",
      (client: AstroMansion): string => JSON.stringify(client),
    ],
    [
      "Node.js's inspection",
      (client: AstroMansion): string =>
        inspect(client, { showHidden: true, depth: null }),
    ],
  ])("keeps the key out of %s", (_case, render) => {
    expect(render(clientOver(new FakeFetch([])))).not.toContain(ISSUED_KEY);
  });
});

describe("the client-side key guard", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {});
  });

  it("refuses a key in a browser page", () => {
    let caught: unknown;
    try {
      clientOver(new FakeFetch([]));
    } catch (error: unknown) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AstroMansionError);
    expect(caught).toMatchObject({
      errorCode: CLIENT_ERROR_CODES.CLIENT_SIDE_KEY,
    });
  });

  it("builds with a key in a browser page when the caller allows it", () => {
    expect(() =>
      clientOver(new FakeFetch([]), { dangerouslyAllowBrowser: true }),
    ).not.toThrow();
  });

  it("builds a visitor client in a browser page", () => {
    expect(() =>
      clientOver(new FakeFetch([]), { apiKey: undefined, requireKey: false }),
    ).not.toThrow();
  });
});
