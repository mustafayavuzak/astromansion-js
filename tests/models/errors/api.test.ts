// PATH: tests/models/errors/api.test.ts

/**
 * API ERRORS TESTS: what every failure carries, and how its message reads
 */

import { describe, expect, it } from "vitest";
import {
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
} from "../../../src/models/errors/api.ts";
import type { JsonValue } from "../../../src/models/records/json.ts";

/** Every class of failure, with the name it reports. */
const CLASSES = [
  [AstroMansionError, "AstroMansionError"],
  [AstroMansionConnectionError, "AstroMansionConnectionError"],
  [AuthenticationError, "AuthenticationError"],
  [QuotaExceededError, "QuotaExceededError"],
  [PermissionDeniedError, "PermissionDeniedError"],
  [NotFoundError, "NotFoundError"],
  [ConflictError, "ConflictError"],
  [ValidationError, "ValidationError"],
  [RateLimitError, "RateLimitError"],
  [ServerError, "ServerError"],
] as const;

describe("AstroMansionError", () => {
  it("joins the summary, the details, and the request id", () => {
    const error = new ValidationError("lat must be within -90..90", {
      details: { field: "lat" },
      requestId: "66c0af19",
    });

    expect(error.message).toBe(
      'lat must be within -90..90 | {"field":"lat"} | request_id=66c0af19',
    );
  });

  it.each<[string, JsonValue]>([
    ["null", null],
    ["false", false],
    ["zero", 0],
    ["empty text", ""],
    ["an empty list", []],
    ["an empty object", {}],
  ])("leaves out details that say nothing, such as %s", (_case, details) => {
    expect(new ServerError("failed", { details }).message).toBe("failed");
  });

  it("keeps every field the API sent", () => {
    const error = new RateLimitError("slow down", {
      statusCode: 429,
      errorCode: "rate_limited",
      details: "per minute",
      requestId: "66c0af19",
      retryAfterSeconds: 30,
    });

    expect(error).toMatchObject({
      statusCode: 429,
      errorCode: "rate_limited",
      details: "per minute",
      requestId: "66c0af19",
      retryAfterSeconds: 30,
    });
  });

  it("keeps the failure underneath as its cause", () => {
    const underneath = new TypeError("fetch failed");

    expect(
      new AstroMansionConnectionError("no answer", { cause: underneath }).cause,
    ).toBe(underneath);
  });

  it.each(CLASSES)(
    "names itself %s and is an AstroMansionError",
    (ErrorClass, name) => {
      const error = new ErrorClass("failed");

      expect(error.name).toBe(name);
      expect(error).toBeInstanceOf(AstroMansionError);
      expect(error).toBeInstanceOf(Error);
    },
  );
});
