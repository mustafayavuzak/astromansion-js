// PATH: tests/documentOutput.test.ts

/**
 * DOCUMENT OUTPUT TESTS: the Python SDK's tests/test_document_output.py, case by case
 *
 * Purpose:
 *   Every endpoint that answers with a document can write it to a path, and
 *   nothing is written unless a path is named. Python checks its synchronous
 *   and its asynchronous client, and JavaScript has the one asynchronous
 *   client. JavaScript adds the case the owner decided: where the runtime
 *   has no file system, output is refused before the request is sent, so no
 *   quota is spent.
 */

import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AstroMansion } from "../src/client.ts";
import {
  exportCsv,
  exportPdf,
  exportReport,
  renderAstrocartography,
  renderBiwheel,
  renderPng,
  renderSharecard,
  renderSvg,
} from "../src/endpointShortcuts.ts";
import { API_ENVIRONMENT } from "../src/models/constants/api.ts";
import { ENDPOINTS } from "../src/models/constants/endpoints.ts";
import { ValidationError } from "../src/models/errors/api.ts";
import { reset, setApiKey } from "../src/shortcuts.ts";
import { FakeFetch, type ScriptedAnswer } from "./fakes/fetch.ts";

const KEY = "am_test_key_0123456789";
const BIRTH = Object.freeze({ date: "2000-01-01", lat: 51.4779, lon: 0 });
const BLOB = new TextEncoder().encode(
  "%PDF-1.4 or <svg/> or PNG, the client does not care",
);
const DOCUMENT: ScriptedAnswer = Object.freeze({
  status: 200,
  body: BLOB,
  headers: { "Content-Type": "application/octet-stream" },
});

/** Call one document method, writing to output when it is given. */
type DocumentCall = (
  client: AstroMansion,
  output: string | undefined,
) => Promise<Uint8Array | string>;

/** The smallest call each document method accepts, by method name. */
const CALLS: Readonly<Record<string, DocumentCall>> = Object.freeze({
  exportCsv: (client, output) => client.exportCsv({ ...BIRTH, output }),
  exportPdf: (client, output) => client.exportPdf({ ...BIRTH, output }),
  exportReport: (client, output) =>
    client.exportReport({ birth: BIRTH, output }),
  renderAstrocartography: (client, output) =>
    client.renderAstrocartography({ birth: BIRTH, output }),
  renderBiwheel: (client, output) =>
    client.renderBiwheel(BIRTH, BIRTH, { output }),
  renderPng: (client, output) => client.renderPng({ ...BIRTH, output }),
  renderSharecard: (client, output) =>
    client.renderSharecard(BIRTH, BIRTH, { output }),
  renderSvg: (client, output) => client.renderSvg({ ...BIRTH, output }),
});

/** The same calls through the module-level shortcuts. */
const SHORTCUT_CALLS: Readonly<
  Record<string, (output: string) => Promise<Uint8Array | string>>
> = Object.freeze({
  exportCsv: (output) => exportCsv({ ...BIRTH, output }),
  exportPdf: (output) => exportPdf({ ...BIRTH, output }),
  exportReport: (output) => exportReport({ birth: BIRTH, output }),
  renderAstrocartography: (output) =>
    renderAstrocartography({ birth: BIRTH, output }),
  renderBiwheel: (output) => renderBiwheel(BIRTH, BIRTH, { output }),
  renderPng: (output) => renderPng({ ...BIRTH, output }),
  renderSharecard: (output) => renderSharecard(BIRTH, BIRTH, { output }),
  renderSvg: (output) => renderSvg({ ...BIRTH, output }),
});

/** The endpoints whose success is a document rather than JSON. */
const BINARY = ENDPOINTS.ALL.filter((endpoint) => endpoint.binary).map(
  (endpoint) => endpoint.name,
);

let directory = "";

/**
 * Find a method's call, failing when the table names a method this file does not cover.
 *
 * @param calls - The calls, by method name.
 * @param name - The method's name.
 * @returns The call.
 */
function callOf<Call>(
  calls: Readonly<Record<string, Call>>,
  name: string,
): Call {
  const call = calls[name];
  if (call === undefined) {
    throw new Error(`no call written for ${name}`);
  }
  return call;
}

beforeEach(async () => {
  vi.stubEnv(API_ENVIRONMENT.KEY, "");
  reset();
  directory = await mkdtemp(join(tmpdir(), "astromansion-"));
});

afterEach(async () => {
  reset();
  await rm(directory, { recursive: true });
});

describe("writing a document to a path", () => {
  it("covers exactly the endpoints that answer with a document", () => {
    expect(new Set(BINARY)).toEqual(new Set(Object.keys(CALLS)));
    expect(new Set(BINARY)).toEqual(
      new Set([
        "exportCsv",
        "exportPdf",
        "exportReport",
        "renderAstrocartography",
        "renderBiwheel",
        "renderPng",
        "renderSharecard",
        "renderSvg",
      ]),
    );
  });

  it.each(BINARY)("lets %s write itself", async (name) => {
    const target = join(directory, `${name}.bin`);
    const fake = new FakeFetch([DOCUMENT]);
    const client = new AstroMansion({ apiKey: KEY, fetch: fake.fetch });

    const written = await callOf(CALLS, name)(client, target);

    expect(written).toBe(target);
    expect(new Uint8Array(await readFile(target))).toEqual(BLOB);
  });

  it.each(BINARY)(
    "lets %s return the bytes and write nothing without a path",
    async (name) => {
      const fake = new FakeFetch([DOCUMENT]);
      const client = new AstroMansion({ apiKey: KEY, fetch: fake.fetch });

      const content = await callOf(CALLS, name)(client, undefined);

      expect(content).toEqual(BLOB);
      expect(await readdir(directory)).toEqual([]);
    },
  );

  it.each(BINARY)("lets the %s shortcut write too", async (name) => {
    const target = join(directory, `${name}.bin`);
    vi.stubGlobal("fetch", new FakeFetch([DOCUMENT]).fetch);
    setApiKey(KEY);

    const written = await callOf(SHORTCUT_CALLS, name)(target);

    expect(written).toBe(target);
    expect(new Uint8Array(await readFile(target))).toEqual(BLOB);
  });

  it("gives no path to a method that answers with data", async () => {
    const fake = new FakeFetch([]);
    const client = new AstroMansion({ apiKey: KEY, fetch: fake.fetch });
    const output = join(directory, "data.json");

    // @ts-expect-error -- natal answers with data, so it takes no output
    await expect(client.natal({ ...BIRTH, output })).rejects.toBeInstanceOf(
      TypeError,
    );
    await expect(
      // @ts-expect-error -- query answers with data, so it takes no output
      client.query({ birth: BIRTH }, { output }),
    ).rejects.toBeInstanceOf(TypeError);
    // A two-person method sends further fields in its body, as Python's **extra does, so only its type refuses output.
    const pairCall = (): Promise<unknown> =>
      // @ts-expect-error -- synastry answers with data, so its type takes no output
      client.synastry(BIRTH, BIRTH, { output });
    expect(pairCall).toBeTypeOf("function");
    expect(fake.calls).toHaveLength(0);
  });
});

/**
 * Stand in for a runtime without a file system, an edge runtime or React Native.
 *
 * @remarks
 * The process keeps every member the test runner needs and lends no file
 * writer, and Deno's global is absent.
 */
function withoutFileSystem(): void {
  const lendsNothing: unknown = Object.create(process, {
    getBuiltinModule: { value: undefined },
  });
  vi.stubGlobal("process", lendsNothing);
  vi.stubGlobal("Deno", undefined);
}

describe("a runtime without a file system", () => {
  it("refuses output before the request is sent, so no quota is spent", async () => {
    const fake = new FakeFetch([DOCUMENT]);
    const client = new AstroMansion({ apiKey: KEY, fetch: fake.fetch });
    withoutFileSystem();

    const refused = client.renderPng({ ...BIRTH, output: "wheel.png" });

    await expect(refused).rejects.toBeInstanceOf(ValidationError);
    await expect(refused).rejects.toThrow(
      "output needs a file system, and this runtime has none. Leave output out to get the bytes.",
    );
    expect(fake.calls).toHaveLength(0);
  });

  it("still returns the bytes there when no path is named", async () => {
    const fake = new FakeFetch([DOCUMENT]);
    const client = new AstroMansion({ apiKey: KEY, fetch: fake.fetch });
    withoutFileSystem();

    expect(await client.renderPng(BIRTH)).toEqual(BLOB);
  });
});
