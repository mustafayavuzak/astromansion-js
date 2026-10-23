// PATH: src/credentials.ts

/**
 * CREDENTIALS: where the key comes from, how it is shown, and where it may go
 *
 * Purpose:
 *   A client resolves its key once, when it is built, and the first source
 *   that holds one wins:
 *
 *     apiKey option ──► ASTROMANSION_API_KEY ──► no key
 *
 *   The key travels only in the X-API-Key header, never in a query string
 *   where it would reach server logs and browser history. It travels only to
 *   a published API path. request() takes a path, never a URL, because the
 *   client attaches the key to every call it sends.
 *
 * Client-side key:
 *   A browser page and a React Native app ship their code to every user, and
 *   a key inside them is everyone's key. A client built there with a key is
 *   refused unless dangerouslyAllowBrowser says the caller accepts that. A
 *   visitor client, built with requireKey false and no key, is never refused.
 */

import {
  API_ADDRESS,
  API_ENVIRONMENT,
  API_HEADERS,
  KEY_MASK,
} from "./models/constants/api.ts";
import { CLIENT_ERROR_CODES } from "./models/constants/errors.ts";
import { PACKAGE_IDENTITY } from "./models/constants/package.ts";
import {
  AstroMansionError,
  AuthenticationError,
  ValidationError,
} from "./models/errors/api.ts";
import type { Settings } from "./settings.ts";

/**
 * Pick the key a client sends.
 *
 * @internal
 * @param option - The apiKey option. Blank text counts as no key.
 * @param settings - The environment, read when the option names no key.
 * @returns The option's key, else ASTROMANSION_API_KEY, each without surrounding whitespace, or undefined.
 *
 * @example
 * ```ts
 * resolveApiKey(" am_live ", settings);   // "am_live"
 * resolveApiKey("   ", settings);         // the environment's key, or undefined
 * ```
 */
export function resolveApiKey(
  option: string | undefined,
  settings: Settings,
): string | undefined {
  const given = option?.trim();
  return given === undefined || given === "" ? settings.apiKey() : given;
}

/**
 * Refuse before the network when no key is available.
 *
 * @internal
 * @remarks
 * A local failure names the missing configuration, while sending the request
 * would spend a round trip to be told the same less clearly. The message also
 * names requireKey false, the explicit way to try the visitor endpoints.
 *
 * @param apiKey - The resolved key, or undefined.
 * @throws {@link AuthenticationError} with the code missing_api_key, when there is no key.
 */
export function requireApiKey(
  apiKey: string | undefined,
): asserts apiKey is string {
  if (apiKey === undefined) {
    throw new AuthenticationError(
      `No API key. Pass new AstroMansion({ apiKey }), or set ${API_ENVIRONMENT.KEY}. ` +
        "To try the visitor endpoints without an account, pass new AstroMansion({ requireKey: false }).",
      { errorCode: CLIENT_ERROR_CODES.MISSING_API_KEY },
    );
  }
}

/**
 * Pick the API root a client sends to.
 *
 * @internal
 * @param option - The baseUrl option. Empty text counts as no root.
 * @param settings - The environment, read when the option names no root.
 * @returns The option, else ASTROMANSION_BASE_URL, else production, without trailing slashes.
 * @throws {@link ValidationError} when the root is not an http or https URL.
 *
 * @example
 * ```ts
 * resolveBaseUrl("https://api.example.test/", settings);   // "https://api.example.test"
 * resolveBaseUrl(undefined, settings);                      // "https://api.astromansion.com", or the environment's
 * resolveBaseUrl("api.example.test", settings);             // throws ValidationError
 * ```
 */
export function resolveBaseUrl(
  option: string | undefined,
  settings: Settings,
): string {
  let chosen =
    option === undefined || option === ""
      ? (settings.baseUrl() ?? API_ADDRESS.BASE_URL)
      : option;
  while (chosen.endsWith("/")) {
    chosen = chosen.slice(0, -1);
  }
  if (!isHttpUrl(chosen)) {
    throw new ValidationError(
      `baseUrl must be an http or https URL, got ${JSON.stringify(chosen)}`,
      {
        errorCode: CLIENT_ERROR_CODES.VALIDATION,
      },
    );
  }
  return chosen;
}

/**
 * Build the headers every request of a client carries.
 *
 * @internal
 * @param apiKey - The resolved key. Without one, no key header is sent and the API answers as to a visitor.
 * @returns JSON content negotiation, the package's User-Agent, and the key header when there is a key.
 *
 * @example
 * ```ts
 * buildHeaders("am_Zx81qP0vT3kL9mN2bC7dE4fG6hJ1sR5w");
 * // { Accept: "application/json", "Content-Type": "application/json",
 * //   "User-Agent": "astromansion/0.1.0-rc.1", "X-API-Key": "am_Zx81qP0vT3kL9mN2bC7dE4fG6hJ1sR5w" }
 * buildHeaders(undefined);   // the same without "X-API-Key", for a visitor
 * ```
 */
export function buildHeaders(
  apiKey: string | undefined,
): Readonly<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
    "User-Agent": PACKAGE_IDENTITY.USER_AGENT,
  };
  if (apiKey !== undefined) {
    headers[API_HEADERS.KEY] = apiKey;
  }
  return Object.freeze(headers);
}

/**
 * Show a key in a form that is safe to print.
 *
 * @internal
 * @param apiKey - The key, or undefined.
 * @returns The key's two ends around an ellipsis, as the key mask in the API constants draws it.
 *
 * @example
 * ```ts
 * maskApiKey("am_Zx81qP0vT3kL9mN2bC7dE4fG6hJ1sR5w");   // "am_Zx81q…sR5w"
 * maskApiKey("abcdefghijkl");                          // "…", since 12 characters are all ends
 * maskApiKey(undefined);                               // "none"
 * ```
 */
export function maskApiKey(apiKey: string | undefined): string {
  if (apiKey === undefined || apiKey === "") {
    return KEY_MASK.ABSENT;
  }
  if (
    apiKey.length <=
    KEY_MASK.VISIBLE_PREFIX_CHARS + KEY_MASK.VISIBLE_SUFFIX_CHARS
  ) {
    return KEY_MASK.ELLIPSIS;
  }
  const head = apiKey.slice(0, KEY_MASK.VISIBLE_PREFIX_CHARS);
  const tail = apiKey.slice(-KEY_MASK.VISIBLE_SUFFIX_CHARS);
  return `${head}${KEY_MASK.ELLIPSIS}${tail}`;
}

/**
 * Refuse a target that is not a published API path.
 *
 * @internal
 * @remarks
 * request() exists so a caller can reach a path this release does not name.
 * A path is all it may reach, since an absolute URL would hand the key to
 * whichever host the text named.
 *
 * @param path - The path a caller passed to request().
 * @throws {@link ValidationError} when the target is not text, is absolute, or lies outside the published paths.
 *
 * @example
 * ```ts
 * checkPath("/v1/natal");                            // passes
 * checkPath("https://elsewhere.example/v1/natal");   // throws ValidationError
 * checkPath("/admin");                               // throws ValidationError
 * ```
 */
export function checkPath(path: unknown): asserts path is string {
  const example = `${API_ADDRESS.PATH_PREFIX}natal`;
  if (typeof path !== "string") {
    throw new ValidationError(
      `path must be text such as "${example}", got ${typeof path}`,
      {
        errorCode: CLIENT_ERROR_CODES.VALIDATION,
      },
    );
  }
  if (path.startsWith("//") || path.includes("://")) {
    throw new ValidationError(
      `path must be a relative API path such as "${example}". ` +
        `The client refuses to send the API key to ${JSON.stringify(path)}.`,
      { errorCode: CLIENT_ERROR_CODES.VALIDATION },
    );
  }
  if (!path.startsWith(API_ADDRESS.PATH_PREFIX)) {
    throw new ValidationError(
      `path must begin with "${API_ADDRESS.PATH_PREFIX}", got ${JSON.stringify(path)}`,
      { errorCode: CLIENT_ERROR_CODES.VALIDATION },
    );
  }
}

/**
 * Refuse a key where it would ship to every user of the app.
 *
 * @internal
 * @param apiKey - The resolved key, or undefined for a visitor client.
 * @param allowed - The dangerouslyAllowBrowser option.
 * @throws {@link AstroMansionError} with the code client_side_key, when a key would ship inside a browser page or a React Native app.
 *
 * @example
 * ```ts
 * const key = "am_Zx81qP0vT3kL9mN2bC7dE4fG6hJ1sR5w";
 * guardClientSideKey(key, false);         // passes on Node.js, Bun, Deno, or an edge runtime
 * guardClientSideKey(key, false);         // throws AstroMansionError in a browser page or a React Native app
 * guardClientSideKey(key, true);          // passes everywhere, the caller accepted the risk
 * guardClientSideKey(undefined, false);   // passes everywhere, a visitor sends no key
 * ```
 */
export function guardClientSideKey(
  apiKey: string | undefined,
  allowed: boolean,
): void {
  if (apiKey === undefined || allowed) {
    return;
  }
  const place = clientSidePlace();
  if (place !== undefined) {
    throw new AstroMansionError(
      `An API key in ${place} ships to every user of the app. Call the API from your own server, ` +
        "build a visitor client with requireKey: false and no key, " +
        "or pass dangerouslyAllowBrowser: true to accept that risk.",
      { errorCode: CLIENT_ERROR_CODES.CLIENT_SIDE_KEY },
    );
  }
}

/**
 * Name the client-side runtime the code runs in, if it runs in one.
 *
 * @returns "a React Native app", "a browser page", or undefined on a server or an edge runtime.
 */
function clientSidePlace(): string | undefined {
  const runtimeNavigator: unknown = Reflect.get(globalThis, "navigator");
  if (
    typeof runtimeNavigator === "object" &&
    runtimeNavigator !== null &&
    Reflect.get(runtimeNavigator, "product") === "ReactNative"
  ) {
    return "a React Native app";
  }
  const runtimeWindow: unknown = Reflect.get(globalThis, "window");
  const runtimeDocument: unknown = Reflect.get(globalThis, "document");
  if (runtimeWindow !== undefined && runtimeDocument !== undefined) {
    return "a browser page";
  }
  return undefined;
}

/**
 * Tell whether a text is an absolute http or https URL.
 *
 * @param text - The candidate root.
 * @returns True when it parses as a URL with the http or https scheme.
 */
function isHttpUrl(text: string): boolean {
  try {
    const parsed = new URL(text);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}
