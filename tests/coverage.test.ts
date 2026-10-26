// PATH: tests/coverage.test.ts

/**
 * COVERAGE TESTS: the Python SDK's tests/test_coverage.py, case by case
 *
 * Purpose:
 *   Every published endpoint is reachable, by method and by shortcut, under
 *   the Python SDK's name written in camelCase. Coverage is not counted by
 *   hand. The endpoint table is generated from the API's own schema, and
 *   these tests check that the client and the module-level surface answer
 *   for all of it.
 */

import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AstroMansion } from "../src/client.ts";
import * as astromansion from "../src/index.ts";
import { API_ENVIRONMENT } from "../src/models/constants/api.ts";
import { ENDPOINTS } from "../src/models/constants/endpoints.ts";
import { AuthenticationError } from "../src/models/errors/api.ts";
import { defaultClient, reset } from "../src/shortcuts.ts";

/** The modules that hold the methods' comments. */
const SOURCES = Object.freeze(
  await Promise.all(
    ["../src/endpointMethods.ts", "../src/client.ts"].map((path) =>
      readFile(new URL(path, import.meta.url), "utf8"),
    ),
  ),
);

/**
 * An operation id the SDKs share. Accepts `natal` and `search_places`.
 * Refuses `searchPlaces` and `_natal`.
 */
const SNAKE_NAME = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*$/;

/**
 * Write a snake_case name in camelCase.
 *
 * @param name - The name.
 * @returns The name in camelCase.
 */
function camel(name: string): string {
  const [first = "", ...rest] = name.split("_");
  return [
    first,
    ...rest.map((word) => `${word.slice(0, 1).toUpperCase()}${word.slice(1)}`),
  ].join("");
}

/**
 * Find the comment written above a method.
 *
 * @param name - The method's name.
 * @returns The comment, or empty text when no module holds the method.
 */
function commentOf(name: string): string {
  for (const source of SOURCES) {
    const at = source.indexOf(`  async ${name}(`);
    if (at !== -1) {
      return source.slice(source.lastIndexOf("/**", at), at);
    }
  }
  return "";
}

beforeEach(() => {
  vi.stubEnv(API_ENVIRONMENT.KEY, "");
  reset();
});

describe("every published endpoint is reachable", () => {
  it("lists every published operation in the table, each under its own name", () => {
    expect(ENDPOINTS.ALL).toHaveLength(68);
    expect(Object.keys(ENDPOINTS.BY_NAME)).toHaveLength(ENDPOINTS.ALL.length);
  });

  it.each(
    ENDPOINTS.ALL.map((endpoint) => [endpoint.name, endpoint.operationId]),
  )("names %s as the Python SDK's %s, in camelCase", (name, operationId) => {
    expect(operationId).toMatch(SNAKE_NAME);
    expect(camel(operationId)).toBe(name);
  });

  it.each(ENDPOINTS.ALL.map((endpoint) => endpoint.name))(
    "gives the client the method %s",
    (name) => {
      expect(typeof Reflect.get(AstroMansion.prototype, name)).toBe("function");
    },
  );

  it.each(ENDPOINTS.ALL)("documents the path $name wraps", (endpoint) => {
    const comment = commentOf(endpoint.name);

    expect(comment).toContain(endpoint.path);
    expect(comment).toContain(endpoint.method);
  });

  it.each(ENDPOINTS.ALL.map((endpoint) => endpoint.name))(
    "gives the package the module-level shortcut %s",
    (name) => {
      expect(typeof Reflect.get(astromansion, name)).toBe("function");
    },
  );

  it("opens no connection on import, and builds the shared client on first use", async () => {
    const fetchSpy = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchSpy);
    vi.resetModules();

    const fresh = await import("../src/index.ts");

    expect(fetchSpy).not.toHaveBeenCalled();
    fresh.reset();
    expect(() => fresh.defaultClient()).toThrow(fresh.AuthenticationError);
    expect(() => defaultClient()).toThrow(AuthenticationError);
  });
});
