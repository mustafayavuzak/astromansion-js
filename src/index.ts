// PATH: src/index.ts

/**
 * ASTROMANSION: the official JavaScript and TypeScript client for the AstroMansion API
 *
 * Purpose:
 *   The package's one public entry, the module its exports map names. It
 *   names what callers may import and holds no behavior of its own:
 *
 *     client.ts                      the client, request(), and its checks
 *     endpointMethods.ts             one named method per published operation, generated
 *     settings.ts, credentials.ts    the environment, and where the key may go
 *     transport/                     fetch, timeouts, retries, and waits
 *     responses/                     decoding answers, checking their shapes, and choosing the error
 *     models/                        named values, records, the API's shapes, and the error classes
 *
 *   Nothing is computed locally. Every call reaches the API, which owns the
 *   ephemeris, the plan, the quota, and the rate limit.
 *
 * Usage:
 *   import { AstroMansion } from "astromansion";
 *
 *   const client = new AstroMansion();   // reads ASTROMANSION_API_KEY
 *
 * @packageDocumentation
 */

export { AstroMansion } from "./client.ts";
export { EndpointMethods } from "./endpointMethods.ts";
export { HTTP_METHODS, type HttpMethod } from "./models/enums/http.ts";
export {
  AstroMansionConnectionError,
  AstroMansionError,
  AuthenticationError,
  ConflictError,
  NotFoundError,
  PermissionDeniedError,
  QuotaExceededError,
  RateLimitError,
  ServerError,
  ValidationError,
} from "./models/errors/api.ts";
export type { AstroMansionErrorInit } from "./models/errors/api.ts";
export type {
  CallOptions,
  ClientOptions,
  FetchFunction,
  QueryValue,
  RequestOptions,
} from "./models/records/client.ts";
export type {
  JsonArray,
  JsonObject,
  JsonPrimitive,
  JsonValue,
  OpenSet,
} from "./models/records/json.ts";
export type * from "./models/schemas/api.ts";
