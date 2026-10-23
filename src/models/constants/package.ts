// PATH: src/models/constants/package.ts

/**
 * PACKAGE CONSTANTS: the name and release this package presents
 *
 * Purpose:
 *   package.json owns the name and the version, and npm publishes from it.
 *   Both are read from there when the package is built, so the User-Agent a
 *   request carries can never disagree with the release that is running.
 *
 * Build:
 *   The two members are imported by name, which the bundler resolves into
 *   the two strings alone. The rest of package.json never reaches dist/.
 */

import { name, version } from "../../../package.json";

/**
 * The package's identity, as npm and the API's logs see it.
 *
 * @internal
 */
export const PACKAGE_IDENTITY = Object.freeze({
  /** The name on npm. */
  NAME: name,
  /** The release, in semantic versioning. */
  VERSION: version,
  /**
   * The only identification a request carries. It names the package and its
   * release, and nothing about the machine or the caller.
   */
  USER_AGENT: `${name}/${version}`,
} as const);

/**
 * The release this package is, as npm names it, the Python SDK's __version__.
 *
 * @example
 * ```ts
 * import { VERSION } from "astromansion";
 *
 * VERSION;   // "0.1.0-alpha.1"
 * ```
 */
export const VERSION: string = version;
