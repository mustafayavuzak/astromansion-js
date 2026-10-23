// PATH: tests/responses/errorPolicy.test.ts

/**
 * ERROR POLICY TESTS: which error a refusal becomes, and whether it is retried
 */

import { describe, expect, it } from "vitest";
import { API_ERROR_CODES } from "../../src/models/constants/errors.ts";
import { RETRY_POLICY } from "../../src/models/constants/transport.ts";
import {
  AstroMansionError,
  AuthenticationError,
  ConflictError,
  NotFoundError,
  PermissionDeniedError,
  QuotaExceededError,
  RateLimitError,
  ServerError,
  ValidationError,
} from "../../src/models/errors/api.ts";
import {
  errorClassFor,
  isQuota,
  isRetryable,
} from "../../src/responses/errorPolicy.ts";

describe("errorClassFor", () => {
  it.each([
    [401, undefined, AuthenticationError],
    [402, undefined, QuotaExceededError],
    [403, undefined, PermissionDeniedError],
    [404, undefined, NotFoundError],
    [409, undefined, ConflictError],
    [422, undefined, ValidationError],
    [429, undefined, RateLimitError],
    [429, "rate_limited", RateLimitError],
    [429, "quota_exceeded", QuotaExceededError],
    [429, "MONTHLY_QUOTA_EXCEEDED", QuotaExceededError],
    [500, undefined, ServerError],
    [503, undefined, ServerError],
    [418, undefined, AstroMansionError],
    [400, undefined, AstroMansionError],
  ])("turns %d with the code %s into %O", (status, code, expected) => {
    expect(errorClassFor(status, code)).toBe(expected);
  });
});

describe("isQuota", () => {
  it.each(API_ERROR_CODES.QUOTA)(
    "reads 429 with %s as a spent quota",
    (code) => {
      expect(isQuota(429, code)).toBe(true);
    },
  );

  it("reads 402 alone as a status, not a quota code", () => {
    expect(isQuota(402, "quota_exceeded")).toBe(false);
  });
});

describe("isRetryable", () => {
  it.each(RETRY_POLICY.RETRYABLE_STATUSES)(
    "retries %d without a quota code",
    (status) => {
      expect(isRetryable(status, undefined)).toBe(true);
    },
  );

  it.each(API_ERROR_CODES.QUOTA)(
    "never retries a 429 with the quota code %s",
    (code) => {
      expect(isRetryable(429, code)).toBe(false);
    },
  );

  it.each([400, 401, 403, 404, 409, 422, 501])("never retries %d", (status) => {
    expect(isRetryable(status, undefined)).toBe(false);
  });
});
