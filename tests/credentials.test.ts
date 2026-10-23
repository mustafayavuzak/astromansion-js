// PATH: tests/credentials.test.ts

/**
 * CREDENTIALS TESTS: key precedence, masking, the path guard, and the client-side key guard
 */

import { describe, expect, it, vi } from "vitest";
import {
  buildHeaders,
  checkPath,
  guardClientSideKey,
  maskApiKey,
  requireApiKey,
  resolveApiKey,
  resolveBaseUrl,
} from "../src/credentials.ts";
import {
  API_ADDRESS,
  API_ENVIRONMENT,
  API_HEADERS,
  KEY_MASK,
} from "../src/models/constants/api.ts";
import { CLIENT_ERROR_CODES } from "../src/models/constants/errors.ts";
import { PACKAGE_IDENTITY } from "../src/models/constants/package.ts";
import {
  AstroMansionError,
  AuthenticationError,
  ValidationError,
} from "../src/models/errors/api.ts";
import { Settings } from "../src/settings.ts";
import { ISSUED_KEY, STAGING_ROOT } from "./fixtures.ts";

/**
 * Build settings over a fixed environment.
 *
 * @param variables - The environment's variables by name.
 * @returns Settings that read only those variables.
 */
function settingsOver(
  variables: Readonly<Record<string, string>> = {},
): Settings {
  return new Settings((name) => variables[name]);
}

describe("resolveApiKey", () => {
  it("prefers the option over the environment", () => {
    const settings = settingsOver({ [API_ENVIRONMENT.KEY]: "am_from_env" });

    expect(resolveApiKey("am_from_option", settings)).toBe("am_from_option");
  });

  it("falls back to the environment when the option is blank", () => {
    const settings = settingsOver({ [API_ENVIRONMENT.KEY]: "am_from_env" });

    expect(resolveApiKey("   ", settings)).toBe("am_from_env");
  });

  it("finds no key when neither source holds one", () => {
    expect(resolveApiKey(undefined, settingsOver())).toBeUndefined();
  });
});

describe("requireApiKey", () => {
  it("refuses a missing key, naming the visitor option and the variable", () => {
    const refusal = (): void => {
      requireApiKey(undefined);
    };

    expect(refusal).toThrow(AuthenticationError);
    expect(refusal).toThrow(/requireKey: false/);
    expect(refusal).toThrow(API_ENVIRONMENT.KEY);
  });

  it("marks the refusal with the missing key code", () => {
    let caught: unknown;
    try {
      requireApiKey(undefined);
    } catch (error: unknown) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AuthenticationError);
    expect(caught).toMatchObject({
      errorCode: CLIENT_ERROR_CODES.MISSING_API_KEY,
    });
  });

  it("passes a present key", () => {
    expect(() => {
      requireApiKey(ISSUED_KEY);
    }).not.toThrow();
  });
});

describe("resolveBaseUrl", () => {
  it("trims every trailing slash from the option", () => {
    expect(resolveBaseUrl(`${STAGING_ROOT}///`, settingsOver())).toBe(
      STAGING_ROOT,
    );
  });

  it("falls back to the environment, then to production", () => {
    const staging = settingsOver({
      [API_ENVIRONMENT.BASE_URL]: `${STAGING_ROOT}/`,
    });

    expect(resolveBaseUrl(undefined, staging)).toBe(STAGING_ROOT);
    expect(resolveBaseUrl(undefined, settingsOver())).toBe(
      API_ADDRESS.BASE_URL,
    );
  });

  it.each([
    ["a host without a scheme", "api.example.test"],
    ["another scheme", "ftp://api.example.test"],
  ])("refuses %s", (_case, root) => {
    expect(() => resolveBaseUrl(root, settingsOver())).toThrow(ValidationError);
  });
});

describe("buildHeaders", () => {
  it("sends the key, JSON negotiation, and the package's User-Agent", () => {
    const headers = buildHeaders(ISSUED_KEY);

    expect(headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": PACKAGE_IDENTITY.USER_AGENT,
      [API_HEADERS.KEY]: ISSUED_KEY,
    });
  });

  it("sends no key header for a visitor", () => {
    expect(Object.keys(buildHeaders(undefined))).not.toContain(API_HEADERS.KEY);
  });
});

describe("maskApiKey", () => {
  const head = ISSUED_KEY.slice(0, KEY_MASK.VISIBLE_PREFIX_CHARS);
  const tail = ISSUED_KEY.slice(-KEY_MASK.VISIBLE_SUFFIX_CHARS);
  const exactlyBothEnds = "a".repeat(
    KEY_MASK.VISIBLE_PREFIX_CHARS + KEY_MASK.VISIBLE_SUFFIX_CHARS,
  );
  const oneMore = `${exactlyBothEnds}b`;

  it.each([
    ["an issued key", ISSUED_KEY, `${head}${KEY_MASK.ELLIPSIS}${tail}`],
    ["a key no longer than both ends", exactlyBothEnds, KEY_MASK.ELLIPSIS],
    [
      "a key one longer than both ends",
      oneMore,
      `${oneMore.slice(0, KEY_MASK.VISIBLE_PREFIX_CHARS)}${KEY_MASK.ELLIPSIS}${oneMore.slice(-KEY_MASK.VISIBLE_SUFFIX_CHARS)}`,
    ],
    ["no key", undefined, KEY_MASK.ABSENT],
    ["an empty key", "", KEY_MASK.ABSENT],
  ])("shows %s safely", (_case, key, shown) => {
    expect(maskApiKey(key)).toBe(shown);
  });

  it("shows only the ellipsis for every key whose two ends would overlap", () => {
    const shown = Array.from(
      { length: exactlyBothEnds.length },
      (_slot, index) => maskApiKey(ISSUED_KEY.slice(0, index + 1)),
    );

    expect(new Set(shown)).toEqual(new Set([KEY_MASK.ELLIPSIS]));
  });
});

describe("checkPath", () => {
  it.each(["/v1/natal", "/v1/custom-body/list"])(
    "passes the published path %s",
    (path) => {
      expect(() => {
        checkPath(path);
      }).not.toThrow();
    },
  );

  it.each([
    ["an absolute URL", "https://elsewhere.example/v1/natal"],
    ["a scheme-relative URL", "//elsewhere.example/v1/natal"],
    ["a path outside /v1/", "/admin"],
    ["a path without its leading slash", "v1/natal"],
    ["a path behind whitespace", " /v1/natal"],
    ["something that is not text", 42],
  ])("refuses %s", (_case, path) => {
    expect(() => {
      checkPath(path);
    }).toThrow(ValidationError);
  });
});

describe("guardClientSideKey", () => {
  it("lets a key through on a server", () => {
    expect(() => {
      guardClientSideKey(ISSUED_KEY, false);
    }).not.toThrow();
  });

  it("refuses a key in a browser page", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {});

    expect(() => {
      guardClientSideKey(ISSUED_KEY, false);
    }).toThrow(/a browser page/);
  });

  it("refuses a key in a React Native app", () => {
    vi.stubGlobal("navigator", { product: "ReactNative" });

    expect(() => {
      guardClientSideKey(ISSUED_KEY, false);
    }).toThrow(/a React Native app/);
  });

  it("marks the refusal with the client-side key code", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {});
    let caught: unknown;
    try {
      guardClientSideKey(ISSUED_KEY, false);
    } catch (error: unknown) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AstroMansionError);
    expect(caught).toMatchObject({
      errorCode: CLIENT_ERROR_CODES.CLIENT_SIDE_KEY,
    });
  });

  it("lets a key through in a browser page when the caller allows it", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {});

    expect(() => {
      guardClientSideKey(ISSUED_KEY, true);
    }).not.toThrow();
  });

  it("never refuses a visitor without a key", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {});

    expect(() => {
      guardClientSideKey(undefined, false);
    }).not.toThrow();
  });
});
