// PATH: src/settings.ts

/**
 * SETTINGS: the configuration the environment gives a client
 *
 * Purpose:
 *   The one reader of the environment. Two variables configure a client
 *   whose options name no value:
 *
 *     ASTROMANSION_API_KEY    the key to send
 *     ASTROMANSION_BASE_URL   the API root, for a staging or a local server
 *
 *   Which source wins over which is decided by the credentials, not here.
 *
 * Runtimes:
 *   Node.js, Bun, and Deno expose the environment as process.env. An edge
 *   runtime, a browser, or React Native may have no process at all, and
 *   there the environment reads as empty, so the key is passed as an option.
 *   The environment is read when a client is built, never at import, so a
 *   variable set after the import still counts.
 */

import { API_ENVIRONMENT } from "./models/constants/api.ts";

/**
 * Reads one environment variable by name, undefined when it is not set.
 *
 * @internal
 */
export type VariableReader = (name: string) => string | undefined;

/**
 * The client's configuration as the environment states it.
 *
 * @internal
 * @remarks
 * Built from a reader so a test hands it a fixed environment. A client builds
 * one with {@link Settings.fromRuntime} each time it is constructed.
 */
export class Settings {
  readonly #read: VariableReader;

  /**
   * Hold the reader the values come from.
   *
   * @param read - Reads one environment variable by name.
   */
  constructor(read: VariableReader) {
    this.#read = read;
  }

  /**
   * Read the environment of the runtime the client runs in.
   *
   * @returns Settings over process.env, which read as empty where the runtime has no process.
   */
  static fromRuntime(): Settings {
    return new Settings(readRuntimeVariable);
  }

  /**
   * The key the environment holds.
   *
   * @returns ASTROMANSION_API_KEY without surrounding whitespace, or undefined when it is unset or blank.
   */
  apiKey(): string | undefined {
    const value = this.#read(API_ENVIRONMENT.KEY)?.trim();
    return value === undefined || value === "" ? undefined : value;
  }

  /**
   * The API root the environment names.
   *
   * @returns ASTROMANSION_BASE_URL, or undefined when it is unset or empty.
   */
  baseUrl(): string | undefined {
    const value = this.#read(API_ENVIRONMENT.BASE_URL);
    return value === undefined || value === "" ? undefined : value;
  }
}

/**
 * Read one variable from process.env, where the runtime has one.
 *
 * @param name - The variable's name.
 * @returns The variable's text, or undefined when there is no such process, environment, or variable.
 */
function readRuntimeVariable(name: string): string | undefined {
  const runtimeProcess: unknown = Reflect.get(globalThis, "process");
  if (typeof runtimeProcess !== "object" || runtimeProcess === null) {
    return undefined;
  }
  const environment: unknown = Reflect.get(runtimeProcess, "env");
  if (typeof environment !== "object" || environment === null) {
    return undefined;
  }
  const value: unknown = Reflect.get(environment, name);
  return typeof value === "string" ? value : undefined;
}
