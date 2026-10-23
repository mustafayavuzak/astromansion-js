// PATH: tests/client.test.ts

/**
 * CLIENT TESTS: the Python SDK's tests/test_client.py, case by case
 *
 * Purpose:
 *   No test reaches the production API. Every request is answered by a
 *   scripted fetch, so the suite spends no quota and passes without
 *   credentials. The cases follow the Python file's order: credentials,
 *   secrecy, requests, responses, errors, retries, and closing. The last
 *   group holds what only JavaScript has, the client-side key guard.
 */

import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AstroMansion } from "../src/client.ts";
import { natal } from "../src/endpointShortcuts.ts";
import {
  API_ENVIRONMENT,
  API_HEADERS,
  KEY_MASK,
} from "../src/models/constants/api.ts";
import { CLIENT_ERROR_CODES } from "../src/models/constants/errors.ts";
import { VERSION } from "../src/models/constants/package.ts";
import {
  AstroMansionConnectionError,
  AstroMansionError,
  AuthenticationError,
  PermissionDeniedError,
  QuotaExceededError,
  RateLimitError,
  ServerError,
  ValidationError,
} from "../src/models/errors/api.ts";
import type { JsonValue } from "../src/models/records/json.ts";
import { reset, setApiKey } from "../src/shortcuts.ts";
import { FakeFetch, jsonAnswer, type ScriptedStep } from "./fakes/fetch.ts";

const BASE = "https://api.astromansion.com";
const KEY = "am_live_testkey_0123456789abcdef";
const BIRTH = Object.freeze({
  date: "2000-01-01",
  time: "12:00",
  lat: 51.4779,
  lon: 0,
});
const NATAL = Object.freeze({
  summary: { Sun: { sign: "Capricorn", dms: "10°49′35″" } },
  planets: [{ name: "Sun", sign: "Capricorn", house: 10, retrograde: false }],
  aspects: [],
}) satisfies JsonValue;

/**
 * Build a client over a script.
 *
 * @param steps - The answers the fetch gives, in order.
 * @param options - Further options.
 * @returns The client, and the fetch to read the calls from.
 */
function scripted(
  steps: readonly ScriptedStep[],
  options: ConstructorParameters<typeof AstroMansion>[0] = {},
): { readonly client: AstroMansion; readonly fake: FakeFetch } {
  const fake = new FakeFetch(steps);
  return {
    client: new AstroMansion({ apiKey: KEY, fetch: fake.fetch, ...options }),
    fake,
  };
}

/**
 * Await a promise that must reject, and return its reason.
 *
 * @param promise - The promise.
 * @returns What it rejected with.
 */
async function rejection(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error: unknown) {
    return error;
  }
  throw new Error("the promise fulfilled");
}

beforeEach(() => {
  vi.stubEnv(API_ENVIRONMENT.KEY, "");
  vi.stubEnv(API_ENVIRONMENT.BASE_URL, "");
  reset();
});

afterEach(() => {
  reset();
});

describe("credentials", () => {
  it("sends an explicit key in the documented header", async () => {
    const { client, fake } = scripted([jsonAnswer(200, NATAL)]);

    await client.natal(BIRTH);

    expect(fake.calls.at(-1)?.headers.get(API_HEADERS.KEY)).toBe(KEY);
  });

  it("takes the key from the environment", async () => {
    vi.stubEnv(API_ENVIRONMENT.KEY, KEY);
    const fake = new FakeFetch([jsonAnswer(200, NATAL)]);

    await new AstroMansion({ fetch: fake.fetch }).natal(BIRTH);

    expect(fake.calls.at(-1)?.headers.get(API_HEADERS.KEY)).toBe(KEY);
  });

  it("puts an explicit key above the environment's", async () => {
    vi.stubEnv(API_ENVIRONMENT.KEY, "am_live_environment_key");
    const { client, fake } = scripted([jsonAnswer(200, NATAL)]);

    await client.natal(BIRTH);

    expect(fake.calls.at(-1)?.headers.get(API_HEADERS.KEY)).toBe(KEY);
  });

  it("lets setApiKey reach the shortcuts", async () => {
    const fake = new FakeFetch([jsonAnswer(200, NATAL)]);
    vi.stubGlobal("fetch", fake.fetch);

    setApiKey(KEY);
    await natal(BIRTH);

    expect(fake.calls.at(-1)?.headers.get(API_HEADERS.KEY)).toBe(KEY);
  });

  it("lets setApiKey replace a key already in use", async () => {
    const fake = new FakeFetch([
      jsonAnswer(200, NATAL),
      jsonAnswer(200, NATAL),
    ]);
    vi.stubGlobal("fetch", fake.fetch);

    setApiKey("am_live_first_key_padding");
    await natal(BIRTH);
    setApiKey(KEY);
    await natal(BIRTH);

    expect(fake.calls.at(-1)?.headers.get(API_HEADERS.KEY)).toBe(KEY);
  });

  it("lets reset forget the key and the client", async () => {
    const fake = new FakeFetch([]);
    vi.stubGlobal("fetch", fake.fetch);
    setApiKey(KEY);

    reset();

    await expect(natal(BIRTH)).rejects.toBeInstanceOf(AuthenticationError);
    expect(fake.calls).toHaveLength(0);
  });

  it("leaves explicit clients alone on reset", async () => {
    const { client, fake } = scripted([jsonAnswer(200, NATAL)]);

    reset();
    await client.natal(BIRTH);

    expect(fake.calls.at(-1)?.headers.get(API_HEADERS.KEY)).toBe(KEY);
  });

  it("fails on a missing key before any request is sent", () => {
    const fake = new FakeFetch([]);

    expect(() => new AstroMansion({ fetch: fake.fetch })).toThrow(
      AuthenticationError,
    );
    expect(fake.calls).toHaveLength(0);
  });

  it("names the visitor option in the missing key's error", () => {
    expect(() => new AstroMansion()).toThrow(/requireKey: false/);
  });

  it("sends a request without a key when requireKey is false", async () => {
    const fake = new FakeFetch([jsonAnswer(200, NATAL)]);

    const chart = await new AstroMansion({
      requireKey: false,
      fetch: fake.fetch,
    }).natal(BIRTH);

    expect(chart.summary["Sun"]?.sign).toBe("Capricorn");
    expect(fake.calls.at(-1)?.headers.has(API_HEADERS.KEY)).toBe(false);
  });

  it("lets two clients keep their own keys", async () => {
    const fake = new FakeFetch([
      jsonAnswer(200, NATAL),
      jsonAnswer(200, NATAL),
    ]);

    await new AstroMansion({
      apiKey: "am_live_first_padding",
      fetch: fake.fetch,
    }).natal(BIRTH);
    await new AstroMansion({
      apiKey: "am_live_second_padding",
      fetch: fake.fetch,
    }).natal(BIRTH);

    expect(fake.calls.map((call) => call.headers.get(API_HEADERS.KEY))).toEqual(
      ["am_live_first_padding", "am_live_second_padding"],
    );
  });
});

describe("secrecy", () => {
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
    expect(render(scripted([]).client)).not.toContain(KEY);
  });

  it.each(
    Array.from(
      {
        length: KEY_MASK.VISIBLE_PREFIX_CHARS + KEY_MASK.VISIBLE_SUFFIX_CHARS,
      },
      (_, index) => index + 1,
    ),
  )(
    "hides a key of %i characters whole, since its two ends would cover it",
    (length) => {
      const text = String(
        scripted([], { apiKey: KEY.slice(0, length) }).client,
      );

      expect(text).toContain(`apiKey='${KEY_MASK.ELLIPSIS}'`);
    },
  );

  it("keeps the key out of an error", async () => {
    const { client } = scripted([
      jsonAnswer(401, { error: { code: "unauthorized", message: "no" } }),
    ]);

    const caught = await rejection(client.natal(BIRTH));

    expect(caught).toBeInstanceOf(AuthenticationError);
    expect(String(caught)).not.toContain(KEY);
    expect(inspect(caught)).not.toContain(KEY);
  });

  it("never sends the key in the query string", async () => {
    const { client, fake } = scripted([jsonAnswer(200, NATAL)]);

    await client.natal(BIRTH);

    expect(fake.calls.at(-1)?.url).not.toContain(KEY);
  });
});

describe("requests", () => {
  it("does not double the path for a root with a trailing slash", async () => {
    const { client, fake } = scripted([jsonAnswer(200, NATAL)], {
      baseUrl: `${BASE}/`,
    });

    await client.natal(BIRTH);

    expect(fake.calls.at(-1)?.url).toBe(`${BASE}/v1/natal`);
  });

  it("nests the flat birth fields under birth, as the API declares", async () => {
    const { client, fake } = scripted([jsonAnswer(200, NATAL)]);

    await client.natal({ ...BIRTH, timezone: 3 });

    const body: unknown = JSON.parse(fake.calls.at(-1)?.body ?? "null");
    expect(body).toEqual({
      birth: {
        date: "2000-01-01",
        lat: 51.4779,
        lon: 0,
        time: "12:00",
        timezone: 3,
      },
    });
    expect(Object.keys(body ?? {})).toEqual(["birth"]);
  });

  it("names the second chart partner in a two-person body", async () => {
    const { client, fake } = scripted([
      jsonAnswer(200, { technique: "synastry", result: { ok: true } }),
    ]);

    await client.synastry(BIRTH, BIRTH);

    const body: unknown = JSON.parse(fake.calls.at(-1)?.body ?? "null");
    expect(Object.keys(body ?? {})).toEqual(["birth", "partner"]);
  });

  it("sends the same request for the options beside the fields and apart", async () => {
    const { client, fake } = scripted([
      jsonAnswer(200, NATAL),
      jsonAnswer(200, NATAL),
    ]);

    await client.natal({ ...BIRTH, options: { wheel: false } });
    await client.natal(BIRTH, { options: { wheel: false } });

    const [first, second] = fake.calls.map((call) => call.body);
    expect(first).toBe(second);
  });

  it("refuses an argument given in both objects", async () => {
    const { client, fake } = scripted([]);

    await expect(
      client.natal(
        { ...BIRTH, options: { wheel: true } },
        { options: { wheel: false } },
      ),
    ).rejects.toBeInstanceOf(TypeError);
    expect(fake.calls).toHaveLength(0);
  });

  it.each(["19-07-1990", "1990/07/19", "", "yesterday"])(
    "catches the malformed date %j before the network",
    async (bad) => {
      const { client, fake } = scripted([]);

      await expect(
        client.natal({ date: bad, lat: 41, lon: 29 }),
      ).rejects.toBeInstanceOf(ValidationError);
      expect(fake.calls).toHaveLength(0);
    },
  );

  it("names the package and its version in the User-Agent", async () => {
    const { client, fake } = scripted([jsonAnswer(200, NATAL)]);

    await client.natal(BIRTH);

    expect(fake.calls.at(-1)?.headers.get("User-Agent")).toBe(
      `astromansion/${VERSION}`,
    );
  });

  it("authenticates request() as it does the named methods", async () => {
    const { client, fake } = scripted([jsonAnswer(200, { ok: true })]);

    await client.request("POST", "/v1/harmonics", { json: { birth: BIRTH } });

    expect(fake.calls.at(-1)?.headers.get(API_HEADERS.KEY)).toBe(KEY);
  });

  it("refuses a body on a GET, which fetch cannot send, without calling fetch", async () => {
    const { client, fake } = scripted([]);

    await expect(
      client.request("GET", "/v1/eclipses", { json: { year: 2027 } }),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(fake.calls).toHaveLength(0);
  });

  it("asks for a key on a call that needs one, even from a visitor client", async () => {
    const fake = new FakeFetch([]);
    const visitor = new AstroMansion({ requireKey: false, fetch: fake.fetch });

    await expect(
      visitor.request("GET", "/v1/custom-body/list", { requireKey: true }),
    ).rejects.toBeInstanceOf(AuthenticationError);
    expect(fake.calls).toHaveLength(0);
  });
});

describe("responses", () => {
  it("reads an answer as fields, by bracket, and as plain JSON", async () => {
    const { client } = scripted([jsonAnswer(200, NATAL)]);

    const chart = await client.natal(BIRTH);

    const [summary, sun, sign] = ["summary", "Sun", "sign"] as const;
    expect(chart.summary["Sun"]?.sign).toBe("Capricorn");
    expect(chart[summary][sun]?.[sign]).toBe("Capricorn");
    expect(chart.planets[0]?.name).toBe("Sun");
    expect(chart.toDict()).toEqual(NATAL);
  });

  it("keeps a field the server adds instead of dropping it", async () => {
    const { client } = scripted([
      jsonAnswer(200, { ...NATAL, houses: [1, 2], new: "kept" }),
    ]);

    const chart = await client.natal(BIRTH);

    const added: unknown = Reflect.get(chart, "new");
    const houses: unknown = Reflect.get(chart, "houses");
    expect(added).toBe("kept");
    expect(houses).toEqual([1, 2]);
  });

  it("reads a field the answer does not carry as undefined, where Python raises", async () => {
    const { client } = scripted([jsonAnswer(200, NATAL)]);

    const chart = await client.natal(BIRTH);

    const absent: unknown = Reflect.get(chart, "houses");
    expect(absent).toBeUndefined();
    // @ts-expect-error -- TypeScript names a field the answer's type does not have, before the code runs
    expect(chart.houses).toBeUndefined();
  });

  it("returns a PDF as bytes", async () => {
    const { client } = scripted([
      {
        status: 200,
        body: new TextEncoder().encode("%PDF-1.4 fake"),
        headers: { "Content-Type": "application/pdf" },
      },
    ]);

    const document = await client.exportPdf(BIRTH);

    expect(document).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(document as Uint8Array)).toMatch(/^%PDF-/);
  });

  it("writes a PDF only when a path is given", async () => {
    const directory = await mkdtemp(join(tmpdir(), "astromansion-"));
    const target = join(directory, "chart.pdf");
    const { client } = scripted([
      {
        status: 200,
        body: new TextEncoder().encode("%PDF-1.4 fake"),
        headers: { "Content-Type": "application/pdf" },
      },
    ]);

    try {
      const written = await client.exportPdf(BIRTH, { output: target });

      expect(written).toBe(target);
      expect(await readFile(target, "utf8")).toMatch(/^%PDF-/);
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});

describe("errors", () => {
  it.each([
    [401, "unauthorized", AuthenticationError],
    [402, "quota", QuotaExceededError],
    [403, "forbidden", PermissionDeniedError],
    [422, "validation", ValidationError],
    [429, "rate_limited", RateLimitError],
    [429, "quota_exceeded", QuotaExceededError],
    [500, "server_error", ServerError],
    [418, "teapot", AstroMansionError],
  ])(
    "maps %i %s to the error that names it",
    async (status, code, expected) => {
      const { client } = scripted(
        [jsonAnswer(status, { error: { code, message: "no" } })],
        { maxRetries: 0 },
      );

      const caught = await rejection(client.natal(BIRTH));

      expect(caught).toBeInstanceOf(expected);
    },
  );

  it("keeps the validation detail for the caller", async () => {
    const { client } = scripted(
      [
        jsonAnswer(422, {
          error: {
            code: "validation",
            message: "Invalid input.",
            detail: "birth.date: must be YYYY-MM-DD",
          },
        }),
      ],
      { maxRetries: 0 },
    );

    const caught = await rejection(client.natal(BIRTH));

    expect(caught).toBeInstanceOf(ValidationError);
    expect(caught).toMatchObject({
      statusCode: 422,
      errorCode: "validation",
      details: "birth.date: must be YYYY-MM-DD",
    });
  });

  it("reads a body that is not the envelope without crashing", async () => {
    const { client } = scripted(
      [{ status: 500, body: "<html>gateway</html>" }],
      { maxRetries: 0 },
    );

    const caught = await rejection(client.natal(BIRTH));

    expect(caught).toBeInstanceOf(ServerError);
    expect(caught).toMatchObject({ statusCode: 500 });
  });

  it("reports the wait a rate limit asked for", async () => {
    const { client } = scripted(
      [
        jsonAnswer(
          429,
          { error: { code: "rate_limited", message: "slow" } },
          { "Retry-After": "12" },
        ),
      ],
      { maxRetries: 0 },
    );

    const caught = await rejection(client.natal(BIRTH));

    expect(caught).toBeInstanceOf(RateLimitError);
    expect(caught).toMatchObject({ retryAfter: 12 });
  });

  it("carries the request id for support", async () => {
    const { client } = scripted(
      [
        jsonAnswer(
          500,
          { error: { code: "server_error", message: "boom" } },
          { "X-Request-ID": "req_abc123" },
        ),
      ],
      { maxRetries: 0 },
    );

    const caught = await rejection(client.natal(BIRTH));

    expect(caught).toMatchObject({ requestId: "req_abc123" });
    expect(String(caught)).toContain("req_abc123");
  });

  it("turns a timeout into a connection error", async () => {
    const { client } = scripted([{ hang: true }], {
      maxRetries: 0,
      timeout: 0.05,
    });

    await expect(client.natal(BIRTH)).rejects.toBeInstanceOf(
      AstroMansionConnectionError,
    );
  });
});

describe("retries", () => {
  it("retries a server error within the limit", async () => {
    const { client, fake } = scripted(
      [
        jsonAnswer(503, { error: { code: "x", message: "x" } }),
        jsonAnswer(200, NATAL),
      ],
      { maxRetries: 2 },
    );

    const chart = await client.natal(BIRTH);

    expect(chart.summary["Sun"]?.sign).toBe("Capricorn");
    expect(fake.calls).toHaveLength(2);
  });

  it("stops retrying at the configured limit", async () => {
    const refusal = jsonAnswer(503, { error: { code: "x", message: "x" } });
    const { client, fake } = scripted([refusal, refusal, refusal], {
      maxRetries: 2,
    });

    await expect(client.natal(BIRTH)).rejects.toBeInstanceOf(ServerError);
    expect(fake.calls).toHaveLength(3);
  });

  it.each([400, 401, 403, 404, 422])(
    "never retries a %i, which the caller must fix",
    async (status) => {
      const { client, fake } = scripted(
        [jsonAnswer(status, { error: { code: "n", message: "n" } })],
        { maxRetries: 3 },
      );

      await expect(client.natal(BIRTH)).rejects.toBeInstanceOf(
        AstroMansionError,
      );
      expect(fake.calls).toHaveLength(1);
    },
  );
});

describe("one asynchronous client, and closing it", () => {
  it("answers every method with a promise, as Python's AsyncAstroMansion does", async () => {
    const { client } = scripted([jsonAnswer(200, NATAL)]);

    const pending = client.natal(BIRTH);

    expect(pending).toBeInstanceOf(Promise);
    expect((await pending).summary["Sun"]?.sign).toBe("Capricorn");
  });

  it("raises the same errors as any other call", async () => {
    const { client } = scripted(
      [jsonAnswer(403, { error: { code: "forbidden", message: "n" } })],
      { maxRetries: 0 },
    );

    await expect(client.natal(BIRTH)).rejects.toBeInstanceOf(
      PermissionDeniedError,
    );
  });

  it("refuses to send once closed", async () => {
    const { client, fake } = scripted([]);

    client.close();

    await expect(client.natal(BIRTH)).rejects.toBeInstanceOf(AstroMansionError);
    expect(fake.calls).toHaveLength(0);
  });

  it("reports a missing key before any fetch is reached", () => {
    const explode = vi.fn<typeof fetch>();

    expect(() => new AstroMansion({ fetch: explode })).toThrow(
      AuthenticationError,
    );
    expect(explode).not.toHaveBeenCalled();
  });
});

describe("the client-side key guard, which only JavaScript has", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {});
  });

  it("refuses a key in a browser page", () => {
    let caught: unknown;
    try {
      scripted([]);
    } catch (error: unknown) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AstroMansionError);
    expect(caught).toMatchObject({
      errorCode: CLIENT_ERROR_CODES.CLIENT_SIDE_KEY,
    });
  });

  it("builds with a key in a browser page when the caller allows it", () => {
    expect(() => scripted([], { dangerouslyAllowBrowser: true })).not.toThrow();
  });

  it("builds a visitor client in a browser page", () => {
    expect(
      () =>
        new AstroMansion({ requireKey: false, fetch: vi.fn<typeof fetch>() }),
    ).not.toThrow();
  });
});

describe("the options", () => {
  it("counts a negative retry count as zero", () => {
    expect(scripted([], { maxRetries: -3 }).client.maxRetries).toBe(0);
  });

  it.each([
    ["a zero timeout", { timeout: 0 }],
    ["a negative timeout", { timeout: -1 }],
    ["a timeout that is not a number", { timeout: Number.NaN }],
    ["an endless timeout", { timeout: Number.POSITIVE_INFINITY }],
    ["a retry count that is not a number", { maxRetries: Number.NaN }],
  ])("refuses %s", (_case, options) => {
    expect(() => scripted([], options)).toThrow(ValidationError);
  });
});
