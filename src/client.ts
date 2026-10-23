// PATH: src/client.ts

/**
 * CLIENT: the AstroMansion class, the one object a caller builds
 *
 * Purpose:
 *   Every endpoint the API publishes is a method, generated from the API's
 *   schema into EndpointMethods. This class adds the transport the generated
 *   methods call, the catalog walk, and the one endpoint written by hand:
 *
 *     client.natal(...) ──► RequestBodies ──► request ──► fetch ──► decodeResponse
 *                                               │  retries 429 and 5xx without a quota code
 *                                               └► AstroMansionConnectionError when no answer
 *
 * Usage:
 *   const client = new AstroMansion();   // reads ASTROMANSION_API_KEY
 *   const chart = await client.natal({
 *     date: "2000-01-01", time: "12:00", lat: 51.4779, lon: 0, timezone: "Europe/London",
 *   });
 *   chart.summary.Sun.sign;
 *
 * Key:
 *   The key lives in a private field. String(client) shows it masked, and
 *   neither JSON.stringify nor Node.js's inspection reaches it.
 */

import { CatalogPages } from "./catalogPages.ts";
import {
  buildHeaders,
  checkPath,
  guardClientSideKey,
  maskApiKey,
  requireApiKey,
  resolveApiKey,
  resolveBaseUrl,
} from "./credentials.ts";
import { EndpointMethods } from "./endpointMethods.ts";
import { SHARECARD } from "./models/constants/bodies.ts";
import { CATALOG_WALK } from "./models/constants/catalog.ts";
import { CLIENT_ERROR_CODES } from "./models/constants/errors.ts";
import {
  RETRY_POLICY,
  TRANSPORT_TIMING,
} from "./models/constants/transport.ts";
import { AstroMansionError, ValidationError } from "./models/errors/api.ts";
import type {
  BirthFields,
  BodiesFields,
  SharecardKeywords,
} from "./models/records/arguments.ts";
import type { ClientOptions, RequestOptions } from "./models/records/client.ts";
import type { JsonValue } from "./models/records/json.ts";
import { RequestBodies } from "./requestBodies.ts";
import type { Result } from "./response.ts";
import { readDocument, readResult } from "./responses/answers.ts";
import { decodeResponse } from "./responses/decoder.ts";
import { documentWriter, saveDocument } from "./responses/documents.ts";
import { isJsonObject } from "./responses/json.ts";
import { Settings } from "./settings.ts";
import { Transport, waitFor } from "./transport/transport.ts";

/** The client's own messages and the method it names in them. */
const CLIENT_CONFIG = Object.freeze({
  /** The refusal of a call on a closed client, as Python's client words it. */
  CLOSED: "Cannot send a request, as the client has been closed.",
  /** The method the catalog walk names in its messages. */
  BODIES: "bodies",
  /** The method the share card names in its messages. */
  SHARECARD: "renderSharecard",
  /** The one method that never carries a body. */
  GET: "GET",
} as const);

/**
 * Talks to the AstroMansion API.
 *
 * @remarks
 * Build one client per key and keep it, since it holds the key, the root, and
 * the retry policy. Every method returns a promise. The key is read from the
 * apiKey option, then from setApiKey, then from ASTROMANSION_API_KEY, which
 * keeps it out of source files. close() ends the client. The class is closed
 * to extension.
 *
 * @example
 * ```ts
 * import { AstroMansion } from "astromansion";
 *
 * const client = new AstroMansion();                          // reads ASTROMANSION_API_KEY
 * const visitor = new AstroMansion({ requireKey: false });    // the visitor endpoints, no account
 * new AstroMansion({ apiKey: "" });                           // throws AuthenticationError when no other source holds a key
 * ```
 */
export class AstroMansion extends EndpointMethods {
  /** The API root requests go to, without a trailing slash. */
  readonly baseUrl: string;
  /** Repeats allowed after a failed first attempt. */
  readonly maxRetries: number;
  readonly #apiKey: string | undefined;
  readonly #requireKey: boolean;
  readonly #transport: Transport;
  #closed = false;

  /**
   * Resolve the key and the root, and build the transport.
   *
   * @remarks
   * The key is checked here, before anything is sent, so a missing key is
   * reported as a missing key and never as a network failure.
   *
   * @param options - How the client is built. Every option may be left out.
   * @throws {@link AuthenticationError} when requireKey holds and no key was found.
   * @throws {@link AstroMansionError} with the code client_side_key, when a key would ship inside a browser page or a React Native app.
   * @throws {@link ValidationError} when timeout or maxRetries cannot be used.
   */
  constructor(options: ClientOptions = {}) {
    super();
    const settings = Settings.fromRuntime();
    const apiKey = resolveApiKey(options.apiKey, settings);
    const requireKey = options.requireKey ?? true;
    if (requireKey) {
      requireApiKey(apiKey);
    }
    guardClientSideKey(apiKey, options.dangerouslyAllowBrowser ?? false);
    this.#apiKey = apiKey;
    this.#requireKey = requireKey;
    this.baseUrl = resolveBaseUrl(options.baseUrl, settings);
    this.maxRetries = retryCount(options.maxRetries);
    this.#transport = new Transport({
      baseUrl: this.baseUrl,
      headers: buildHeaders(apiKey),
      timeoutMs: attemptTimeoutMs(options.timeout),
      maxRetries: this.maxRetries,
      fetch: options.fetch ?? globalThis.fetch,
      wait: waitFor,
      random: () => Math.random(),
    });
  }

  /**
   * End the client. It cannot send after this.
   *
   * @remarks
   * fetch keeps no pool of its own to release, so closing marks the client
   * done, as Python's close() does. JavaScript has no with block, so a
   * caller closes in a finally block when it wants the client ended.
   *
   * @example
   * ```ts
   * client.close();
   * await client.natal(birth);   // throws AstroMansionError
   * ```
   */
  close(): void {
    this.#closed = true;
  }

  /**
   * Call any published endpoint, including one this release has no method for.
   *
   * @remarks
   * The API publishes more endpoints than a release may name, so this is the
   * supported way to reach the rest. Authentication, timeouts, retries, and
   * error mapping behave exactly as for the named methods.
   *
   * @param method - The HTTP method.
   * @param path - A path beginning with /v1/. A URL is refused, since the key would go wherever it points.
   * @param options - The body, the query, and how the answer is read.
   * @returns A Result for JSON, text for a text/plain answer, and bytes for any other document.
   * @throws {@link ValidationError} when the path or the body is refused before sending, or when the API answers 422.
   * @throws {@link AuthenticationError} when a key is needed and none was found, or when the API answers 401.
   * @throws {@link AstroMansionConnectionError} when no answer arrived after every retry.
   * @throws {@link AstroMansionError} or the subclass that names the cause, for any other refusal, or when the client was closed.
   *
   * @example
   * ```ts
   * const harmonics = await client.request("POST", "/v1/harmonics", {
   *   json: { birth: { date: "2000-01-01", lat: 51.4779, lon: 0 } },
   * });
   * const eclipses = await client.request("GET", "/v1/eclipses", { params: { year: 2027 } });
   * await client.request("GET", "https://elsewhere.example/v1/natal");   // throws ValidationError
   * ```
   */
  override async request(
    method: string,
    path: string,
    options: RequestOptions = {},
  ): Promise<Result | string | Uint8Array> {
    if (this.#closed) {
      throw new AstroMansionError(CLIENT_CONFIG.CLOSED);
    }
    checkPath(path);
    const verb = method.toUpperCase();
    if (verb === CLIENT_CONFIG.GET && options.json !== undefined) {
      throw new ValidationError(
        "a GET request carries no body. Pass its values as params.",
        { errorCode: CLIENT_ERROR_CODES.VALIDATION },
      );
    }
    if (options.requireKey ?? this.#requireKey) {
      requireApiKey(this.#apiKey);
    }
    const expectDocument = options.binary ?? false;
    const received = await this.#transport.send({
      method: verb,
      path,
      json: options.json,
      params: options.params,
      expectDocument,
      signal: options.signal,
    });
    return decodeResponse(received, {
      expectDocument,
      technique: options.technique,
      enveloped: options.enveloped,
    });
  }

  /**
   * Read whole catalog categories, following the paging for you.
   *
   * @remarks
   * chart() answers one page at a time and the catalog is larger than one
   * page, so this walks it. Naming several categories reads them in one walk
   * rather than one walk each, and the return is always keyed by the
   * categories asked for. A walk needing more than twelve requests stops
   * after the first page and names the size, since nothing prints until the
   * last page lands. asteroids is twenty-eight thousand bodies and 177 round
   * trips.
   *
   * @param args - The category keys, such as fixed_stars, then the birth fields with pageSize, options, confirmLarge, onPage, and signal.
   * @returns Each category asked for, with all of its rows.
   * @throws {@link ValidationError} for no category, a page size the API refuses, a malformed birth field, or a category large enough to need confirmLarge.
   * @throws {@link ServerError} when the answers never end the walk.
   * @throws {@link AstroMansionError} when the API refuses, or never answers.
   *
   * @example
   * ```ts
   * const found = await client.bodies("fixed_stars", "arabic_lots", {
   *   date: "2000-01-01", time: "12:00", lat: 51.4779, lon: 0, timezone: "Europe/London",
   * });
   * found["fixed_stars"]?.length;   // 906, in six requests
   * ```
   */
  async bodies(
    ...args: [...categories: string[], fields: BodiesFields]
  ): Promise<Readonly<Record<string, JsonValue[]>>> {
    const fields = args.at(-1);
    if (typeof fields !== "object") {
      throw new TypeError(
        `${CLIENT_CONFIG.BODIES}() takes the birth fields as its last argument`,
      );
    }
    const categories = args.slice(0, -1).map((category) => {
      if (typeof category !== "string") {
        throw new TypeError(
          `${CLIENT_CONFIG.BODIES}() takes category keys as text`,
        );
      }
      return category;
    });
    const {
      pageSize = CATALOG_WALK.PAGE_MAX,
      options,
      confirmLarge = false,
      onPage,
      signal,
      ...birth
    } = fields;
    const collected: Record<string, JsonValue[]> = Object.fromEntries(
      categories.map((category) => [category, []]),
    );
    let offset = 0;
    for (let pass = 0; pass < CATALOG_WALK.PAGE_CEILING; pass += 1) {
      const pageOptions = CatalogPages.options(
        categories,
        options,
        offset,
        pageSize,
      );
      const call = RequestBodies.chart(
        CLIENT_CONFIG.BODIES,
        birth,
        { options: pageOptions, signal },
        false,
      );
      const answer = await this.request("POST", CATALOG_WALK.PATH, {
        json: call.json,
        technique: CATALOG_WALK.TECHNIQUE,
        signal: call.signal,
      });
      const page = readResult(answer, isJsonObject, CLIENT_CONFIG.BODIES).data;
      const requests = pass + 1;
      const following = CatalogPages.absorb(page, collected, offset);
      if (requests === 1 && !confirmLarge) {
        CatalogPages.guardSize(page, pageSize, categories);
      }
      onPage?.(requests, CatalogPages.remaining(page, pageSize), collected);
      if (following === undefined) {
        return collected;
      }
      offset = following;
    }
    throw CatalogPages.exhausted();
  }

  /**
   * Draw a story card for one or two charts, `POST /v1/render/sharecard`.
   *
   * @remarks
   * type "synastry" reads both charts and leads on the compatibility score.
   * type "natal" reads one chart and leads on the Sun, Moon, and Ascendant.
   * Written by hand so the two charts stay two arguments while partner is
   * optional, as in the Python SDK.
   *
   * @param birth - The chart, or the first of two. Null reads one chart's fields from keywords.
   * @param partner - The second chart, which a synastry card needs.
   * @param keywords - type, name or names, lang, output, signal, and one chart's fields when birth is null.
   * @returns The SVG's bytes, or the path written when output is given.
   * @throws TypeError when both name and names are given.
   * @throws {@link ValidationError} when a birth field is malformed, the API refuses the card, or output is given where there is no file system.
   * @throws {@link AstroMansionError} when the API refuses, or never answers.
   *
   * @example
   * ```ts
   * const card = await client.renderSharecard(birth, partner, { names: ["Ada", "Alan"] });
   * await client.renderSharecard(birth, null, { type: "natal", name: "Ada", output: "card.svg" });
   * ```
   */
  async renderSharecard(
    birth?: BirthFields | null,
    partner?: BirthFields | null,
    keywords?: SharecardKeywords,
  ): Promise<Uint8Array | string> {
    const call = RequestBodies.sharecard(birth, partner, keywords);
    const writer = documentWriter(call.output);
    const answer = await this.request("POST", SHARECARD.PATH, {
      json: call.json,
      binary: true,
      technique: SHARECARD.TECHNIQUE,
      enveloped: undefined,
      signal: call.signal,
    });
    return saveDocument(
      readDocument(answer, CLIENT_CONFIG.SHARECARD),
      call.output,
      writer,
    );
  }

  /**
   * Describe the client with its key masked, since a description reaches logs.
   *
   * @returns The API root and the masked key.
   *
   * @example
   * ```ts
   * String(new AstroMansion({ apiKey: "am_Zx81qP0vT3kL9mN2bC7dE4fG6hJ1sR5w" }));
   * // "AstroMansion(baseUrl='https://api.astromansion.com', apiKey='am_Zx81q…sR5w')"
   * ```
   */
  override toString(): string {
    return `AstroMansion(baseUrl='${this.baseUrl}', apiKey='${maskApiKey(this.#apiKey)}')`;
  }
}

/**
 * Read the maxRetries option.
 *
 * @param option - The option, or undefined for the default.
 * @returns The whole number of repeats, zero for a negative value.
 * @throws {@link ValidationError} when the value is not a finite number.
 */
function retryCount(option: number | undefined): number {
  const value = option ?? RETRY_POLICY.MAX_RETRIES;
  if (!Number.isFinite(value)) {
    throw new ValidationError(
      `maxRetries must be a finite number, got ${String(value)}`,
      { errorCode: CLIENT_ERROR_CODES.VALIDATION },
    );
  }
  return Math.max(0, Math.trunc(value));
}

/**
 * Read the timeout option.
 *
 * @param option - The option in seconds, or undefined for the default.
 * @returns The timeout of one attempt, in milliseconds.
 * @throws {@link ValidationError} when the value is not a positive finite number.
 */
function attemptTimeoutMs(option: number | undefined): number {
  const value = option ?? TRANSPORT_TIMING.ATTEMPT_TIMEOUT_SECONDS;
  if (!Number.isFinite(value) || value <= 0) {
    throw new ValidationError(
      `timeout must be a positive number of seconds, got ${String(value)}`,
      { errorCode: CLIENT_ERROR_CODES.VALIDATION },
    );
  }
  return value * TRANSPORT_TIMING.MS_PER_SECOND;
}
