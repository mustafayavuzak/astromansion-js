// PATH: src/shortcuts.ts

/**
 * SHORTCUTS: the client the module-level shortcuts share
 *
 * Purpose:
 *   Convenience only, for a notebook or a one-file script. An application
 *   should build an AstroMansion instead, so two of them can carry two
 *   different keys without either depending on module-wide state.
 *
 *   The shared client's lifecycle:
 *
 *     first shortcut call ──► client built from the shared key or the environment
 *     setApiKey(key)      ──► key stored, client closed, rebuilt on the next call
 *     reset()             ──► key forgotten, client closed
 *
 *   Importing the package builds nothing and opens nothing. The client is
 *   built on the first call.
 */

import { AstroMansion } from "./client.ts";
import { shareApiKey } from "./credentials.ts";
import type { BodiesFields } from "./models/records/arguments.ts";
import type { RequestOptions } from "./models/records/client.ts";
import type { JsonValue } from "./models/records/json.ts";
import type { Result } from "./response.ts";

/** The client the shortcuts share, built on first use. */
class SharedClient {
  #client: AstroMansion | undefined = undefined;

  /**
   * Return the shared client, building it on first use.
   *
   * @returns The shared client.
   * @throws {@link AuthenticationError} when the client is built now and no key was found.
   */
  get(): AstroMansion {
    this.#client ??= new AstroMansion();
    return this.#client;
  }

  /** Close and forget the shared client. */
  drop(): void {
    this.#client?.close();
    this.#client = undefined;
  }
}

/** The one shared client of the module. */
const sharedClient = new SharedClient();

/**
 * Set the key the module-level shortcuts use.
 *
 * @remarks
 * The shared client is dropped, so the new key takes effect on the next call
 * rather than in the next process.
 *
 * @param apiKey - The API key. Blank text clears it, as reset() does.
 *
 * @example
 * ```ts
 * import * as am from "astromansion";
 *
 * am.setApiKey("your key");   // or rely on ASTROMANSION_API_KEY
 * const chart = await am.natal({ date: "2000-01-01", lat: 51.4779, lon: 0 });
 * ```
 */
export function setApiKey(apiKey: string): void {
  shareApiKey(apiKey);
  sharedClient.drop();
}

/**
 * Return the shortcuts to their starting state.
 *
 * @remarks
 * Closes the shared client and forgets any key given to setApiKey, so the
 * next call reads the environment again. Clients built explicitly are
 * untouched, since each carries its own key. A test wants this between
 * cases.
 *
 * @example
 * ```ts
 * am.reset();   // the next shortcut reads ASTROMANSION_API_KEY again
 * ```
 */
export function reset(): void {
  shareApiKey(undefined);
  sharedClient.drop();
}

/**
 * Return the client the shortcuts share.
 *
 * @remarks
 * An extension point rather than an everyday call. Reach for it to inspect
 * the client the module-level functions use. Most callers want setApiKey, a
 * shortcut, or their own AstroMansion.
 *
 * @returns The shared client, built on first use.
 * @throws {@link AuthenticationError} when the client is built now and no key was found.
 *
 * @example
 * ```ts
 * String(am.defaultClient());   // "AstroMansion(baseUrl='https://api.astromansion.com', apiKey='am_live_…cdef')"
 * ```
 */
export function defaultClient(): AstroMansion {
  return sharedClient.get();
}

/**
 * Call any endpoint with the shared client.
 *
 * @remarks
 * Not generated from the endpoint table, because it is not an endpoint. It
 * is how a caller reaches a path this release does not yet name.
 *
 * @param method - The HTTP method.
 * @param path - A path beginning with /v1/.
 * @param options - Passed to {@link AstroMansion.request}.
 * @returns What {@link AstroMansion.request} returns.
 * @throws {@link AstroMansionError} when the path is refused, no key was found, the API refuses the call, or no answer arrives.
 *
 * @example
 * ```ts
 * await am.request("POST", "/v1/harmonics", { json: { birth } });
 * ```
 */
export async function request(
  method: string,
  path: string,
  options?: RequestOptions,
): Promise<Result | string | Uint8Array> {
  return defaultClient().request(method, path, options);
}

/**
 * Read whole catalog categories with the shared client.
 *
 * @remarks
 * Not generated from the endpoint table, because it is not an endpoint. It
 * is one call over as many /v1/chart pages as the categories need.
 *
 * @param args - The category keys, then the birth fields and the walk's options.
 * @returns Each category asked for, with all of its rows.
 * @throws {@link AstroMansionError} when the walk is refused or cannot finish.
 *
 * @example
 * ```ts
 * const found = await am.bodies("arabic_lots", { date: "2000-01-01", lat: 51.4779, lon: 0 });
 * ```
 */
export async function bodies(
  ...args: [...categories: string[], fields: BodiesFields]
): Promise<Readonly<Record<string, JsonValue[]>>> {
  return defaultClient().bodies(...args);
}
