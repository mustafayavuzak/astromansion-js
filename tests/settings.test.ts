// PATH: tests/settings.test.ts

/**
 * SETTINGS TESTS: reading the key and the root from the environment
 */

import { describe, expect, it, vi } from "vitest";
import { API_ENVIRONMENT } from "../src/models/constants/api.ts";
import { Settings } from "../src/settings.ts";
import { STAGING_ROOT } from "./fixtures.ts";

/**
 * Build settings over a fixed environment.
 *
 * @param variables - The environment's variables by name.
 * @returns Settings that read only those variables.
 */
function settingsOver(variables: Readonly<Record<string, string>>): Settings {
  return new Settings((name) => variables[name]);
}

describe("Settings", () => {
  it("reads the key without its surrounding whitespace", () => {
    const settings = settingsOver({ [API_ENVIRONMENT.KEY]: "  am_env_key \n" });

    expect(settings.apiKey()).toBe("am_env_key");
  });

  it("treats a blank key as no key", () => {
    const settings = settingsOver({ [API_ENVIRONMENT.KEY]: "   " });

    expect(settings.apiKey()).toBeUndefined();
  });

  it("treats an empty root as no root", () => {
    const settings = settingsOver({ [API_ENVIRONMENT.BASE_URL]: "" });

    expect(settings.baseUrl()).toBeUndefined();
  });

  it("reads the root as it is written", () => {
    const settings = settingsOver({
      [API_ENVIRONMENT.BASE_URL]: `${STAGING_ROOT}/`,
    });

    expect(settings.baseUrl()).toBe(`${STAGING_ROOT}/`);
  });

  it("reads process.env when built from the runtime", () => {
    vi.stubEnv(API_ENVIRONMENT.KEY, "am_runtime_key");

    expect(Settings.fromRuntime().apiKey()).toBe("am_runtime_key");
  });

  it("reads the environment as an empty one where the runtime has no process", () => {
    vi.stubGlobal("process", undefined);
    let read: (string | undefined)[];
    try {
      const settings = Settings.fromRuntime();
      read = [settings.apiKey(), settings.baseUrl()];
    } finally {
      // The test runner needs its process back before anything else runs.
      vi.unstubAllGlobals();
    }

    expect(read).toEqual([undefined, undefined]);
  });
});
