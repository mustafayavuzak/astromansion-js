// PATH: src/index.ts

/**
 * ASTROMANSION: the official JavaScript and TypeScript client for the AstroMansion API
 *
 * Purpose:
 *   The package's one public entry, the module its exports map names. It
 *   names what callers may import, the same names as the Python SDK's
 *   astromansion module, written in JavaScript's camelCase, and holds no
 *   behavior of its own:
 *
 *     client.ts                         the client, request(), bodies(), and renderSharecard()
 *     endpointMethods.ts                one method per endpoint, generated
 *     endpointShortcuts.ts, shortcuts.ts  the module-level shortcuts, and setApiKey() and reset()
 *     requestBodies.ts, catalogPages.ts   request bodies, and the catalog walk
 *     response.ts                       the Result every JSON answer becomes
 *     settings.ts, credentials.ts       the environment, and where the key may go
 *     transport/, responses/            fetch, retries, decoding, and documents
 *     models/                           named values, records, the API's shapes, and the errors
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
export type { EndpointMethods } from "./endpointMethods.ts";
export * from "./endpointShortcuts.ts";
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
export { VERSION } from "./models/constants/package.ts";
export type {
  BirthFields,
  BodiesFields,
  BodyFields,
  CallKeywords,
  CatalogProgress,
  ChartFields,
  ChartKeywords,
  DocumentKeywords,
  PairKeywords,
  ParamsFields,
  SharecardKeywords,
} from "./models/records/arguments.ts";
export type {
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
export { Result } from "./response.ts";
export type {
  ResultConstructor,
  ResultFields,
  ResultMembers,
  ResultOwnName,
} from "./response.ts";
export { ErrorPolicy } from "./responses/errorPolicy.ts";
export {
  bodies,
  defaultClient,
  request,
  reset,
  setApiKey,
} from "./shortcuts.ts";
