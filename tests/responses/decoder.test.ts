// PATH: tests/responses/decoder.test.ts

/**
 * DECODER TESTS: what an answer becomes, and what a refusal carries
 */

import { describe, expect, it } from "vitest";
import { API_HEADERS } from "../../src/models/constants/api.ts";
import {
  NotFoundError,
  QuotaExceededError,
  RateLimitError,
  ServerError,
  ValidationError,
} from "../../src/models/errors/api.ts";
import type { JsonValue } from "../../src/models/records/json.ts";
import type { ReceivedResponse } from "../../src/models/records/response.ts";
import { Result } from "../../src/response.ts";
import {
  type DecodeOptions,
  decodeResponse,
  errorCodeOf,
  isPlainText,
} from "../../src/responses/decoder.ts";

/** Read the answer as JSON, letting the body decide its wrapper. */
const AS_JSON: DecodeOptions = {
  expectDocument: false,
  technique: undefined,
  enveloped: undefined,
};
/** Read the answer as a document. */
const AS_DOCUMENT: DecodeOptions = {
  expectDocument: true,
  technique: undefined,
  enveloped: undefined,
};

/**
 * Decode an answer that must be JSON, and return its Result.
 *
 * @param received - The answer.
 * @param options - How the answer is read.
 * @returns The Result.
 */
function resultOf(
  received: ReceivedResponse,
  options: DecodeOptions = AS_JSON,
): Result {
  const decoded = decodeResponse(received, options);
  if (!(decoded instanceof Result)) {
    throw new Error("the answer did not become a Result");
  }
  return decoded;
}
/** The request id the API's answers carry in these tests. */
const REQUEST_ID = "66c0af19";

/**
 * Build an answer whose body was read as text.
 *
 * @param status - The HTTP status.
 * @param text - The body.
 * @param headers - The response headers.
 * @returns The answer as the transport hands it over.
 */
function receivedText(
  status: number,
  text: string,
  headers: Readonly<Record<string, string>> = {},
): ReceivedResponse {
  return {
    status,
    headers: new Headers(headers),
    body: { kind: "text", text },
  };
}

/**
 * Build a JSON answer that carries the request id.
 *
 * @param status - The HTTP status.
 * @param payload - The body.
 * @param headers - Further headers.
 * @returns The answer as the transport hands it over.
 */
function receivedJson(
  status: number,
  payload: JsonValue,
  headers: Readonly<Record<string, string>> = {},
): ReceivedResponse {
  return receivedText(status, JSON.stringify(payload), {
    "Content-Type": "application/json",
    [API_HEADERS.REQUEST_ID]: REQUEST_ID,
    ...headers,
  });
}

/**
 * Decode an answer that must be refused, and return the error it became.
 *
 * @param received - The refused answer.
 * @param options - How the answer is read.
 * @returns What decodeResponse threw.
 */
function refusalOf(
  received: ReceivedResponse,
  options: DecodeOptions = AS_JSON,
): unknown {
  try {
    decodeResponse(received, options);
  } catch (error: unknown) {
    return error;
  }
  throw new Error("the answer was not refused");
}

describe("decodeResponse refusals", () => {
  it("carries every part of the error envelope", () => {
    const error = refusalOf(
      receivedJson(422, {
        error: {
          code: "validation",
          message: "lat must be within -90..90",
          detail: "lat",
        },
      }),
    );

    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({
      statusCode: 422,
      errorCode: "validation",
      details: "lat",
      requestId: REQUEST_ID,
      message: `lat must be within -90..90 | lat | request_id=${REQUEST_ID}`,
    });
  });

  it("carries the pause a rate limit asks for", () => {
    const error = refusalOf(
      receivedJson(
        429,
        { error: { code: "rate_limited", message: "slow down" } },
        { "Retry-After": "7" },
      ),
    );

    expect(error).toBeInstanceOf(RateLimitError);
    expect(error).toMatchObject({ retryAfter: 7 });
  });

  it("keeps a spent quota apart from a rate limit", () => {
    const error = refusalOf(
      receivedJson(429, { error: { code: "quota_exceeded" } }),
    );

    expect(error).toBeInstanceOf(QuotaExceededError);
  });

  it("falls back to the status when the body is not the envelope", () => {
    const error = refusalOf(
      receivedText(502, "<html>Bad Gateway</html>", {
        "Content-Type": "text/html",
      }),
    );

    expect(error).toBeInstanceOf(ServerError);
    expect(error).toMatchObject({
      statusCode: 502,
      errorCode: undefined,
      message: "AstroMansion API returned HTTP 502",
    });
  });

  it("reads the bare validation body as the details", () => {
    const problems = [
      { loc: ["body", "birth", "lat"], msg: "Input should be less than 90" },
    ];
    const error = refusalOf(receivedJson(422, { detail: problems }));

    expect(error).toBeInstanceOf(ValidationError);
    expect(error).toMatchObject({ details: problems });
  });

  it("reads the refusal of a document request as the error envelope", () => {
    const error = refusalOf(
      receivedJson(404, {
        error: { code: "not_found", message: "no such body" },
      }),
      AS_DOCUMENT,
    );

    expect(error).toBeInstanceOf(NotFoundError);
  });
});

describe("decodeResponse successes", () => {
  it("opens the wrapper of a JSON answer, named as the server named it", () => {
    const answer = receivedJson(200, {
      technique: "chart",
      result: { summary: { Sun: "Leo" } },
    });

    const result = resultOf(answer, { ...AS_JSON, technique: "natal" });

    expect(result.data).toEqual({ summary: { Sun: "Leo" } });
    expect(result.technique).toBe("chart");
  });

  it("names a direct answer for the endpoint that was called", () => {
    const result = resultOf(receivedJson(200, { summary: {} }), {
      ...AS_JSON,
      technique: "natal",
    });

    expect(result.technique).toBe("natal");
  });

  it("keeps a JSON answer whole when told it is not wrapped", () => {
    const body = { technique: "natal", result: { summary: {} } };

    const result = resultOf(receivedJson(200, body), {
      ...AS_JSON,
      enveloped: false,
    });

    expect(result.data).toEqual(body);
    expect(result.raw).toEqual(body);
  });

  it("returns JSON's null as a Result whose data is null", () => {
    expect(resultOf(receivedText(200, "null")).data).toBeNull();
  });

  it("returns a plain text answer as text", () => {
    const answer = receivedText(200, "Saturn Taurus 10°23′44″", {
      "Content-Type": "text/plain; charset=utf-8",
    });

    expect(decodeResponse(answer, AS_JSON)).toBe("Saturn Taurus 10°23′44″");
  });

  it("returns an answer that is neither JSON nor plain text as bytes", () => {
    const answer = receivedText(200, "<p>chart</p>", {
      "Content-Type": "text/html",
    });

    expect(decodeResponse(answer, AS_JSON)).toEqual(
      new TextEncoder().encode("<p>chart</p>"),
    );
  });

  it("returns a document's bytes untouched", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const answer: ReceivedResponse = {
      status: 200,
      headers: new Headers({ "Content-Type": "image/png" }),
      body: { kind: "bytes", bytes: png },
    };

    expect(decodeResponse(answer, AS_DOCUMENT)).toBe(png);
  });

  it("returns a plain text document as text", () => {
    const answer = receivedText(200, "date,body\n", {
      "Content-Type": "text/plain",
    });

    expect(decodeResponse(answer, AS_DOCUMENT)).toBe("date,body\n");
  });
});

describe("errorCodeOf", () => {
  it("reads the code of an error envelope", () => {
    expect(
      errorCodeOf(receivedJson(429, { error: { code: "rate_limited" } })),
    ).toBe("rate_limited");
  });

  it.each<[string, ReceivedResponse]>([
    ["a body that is not JSON", receivedText(503, "Service Unavailable")],
    ["a JSON body without an envelope", receivedJson(503, { status: "down" })],
    [
      "a body read as bytes",
      {
        status: 200,
        headers: new Headers(),
        body: { kind: "bytes", bytes: new Uint8Array() },
      },
    ],
  ])("finds no code in %s", (_case, received) => {
    expect(errorCodeOf(received)).toBeUndefined();
  });
});

describe("isPlainText", () => {
  it.each<[string | null, boolean]>([
    ["text/plain", true],
    ["Text/Plain; charset=utf-8", true],
    ["text/csv", false],
    ["application/json", false],
    [null, false],
  ])("reads %s as plain text: %s", (contentType, expected) => {
    expect(isPlainText(contentType)).toBe(expected);
  });
});
