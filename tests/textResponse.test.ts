// PATH: tests/textResponse.test.ts

/**
 * TEXT RESPONSE TESTS: the Python SDK's tests/test_text_response.py, case by case
 *
 * Purpose:
 *   /v1/query answers format "box" with text/plain, meant to be printed.
 *   Handing that back as bytes would print numbers, so it arrives as text.
 *   Every other answer that is not JSON is a document the caller writes to
 *   a file, and it stays bytes.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AstroMansion } from "../src/client.ts";
import { API_ENVIRONMENT } from "../src/models/constants/api.ts";
import { isPlainText } from "../src/responses/decoder.ts";
import { FakeFetch } from "./fakes/fetch.ts";

const BOX =
  "┌────────┬───────────┐\n│ name   │ sign      │\n└────────┴───────────┘";
const BIRTH = Object.freeze({ date: "2000-01-01", lat: 51.4779, lon: 0 });

/**
 * Build a client whose every answer is the given content.
 *
 * @param content - The body.
 * @param contentType - The Content-Type, or undefined to send none.
 * @returns The client.
 */
function clientOver(
  content: Uint8Array<ArrayBuffer>,
  contentType: string | undefined,
): AstroMansion {
  const fake = new FakeFetch([
    {
      status: 200,
      body: content,
      headers: contentType === undefined ? {} : { "Content-Type": contentType },
    },
  ]);
  return new AstroMansion({
    apiKey: "test",
    baseUrl: "https://api.example",
    maxRetries: 0,
    fetch: fake.fetch,
  });
}

beforeEach(() => {
  vi.stubEnv(API_ENVIRONMENT.KEY, "");
});

describe("text and documents", () => {
  it("returns a rendered table as text, ready to print", async () => {
    const client = clientOver(
      new TextEncoder().encode(BOX),
      "text/plain; charset=utf-8",
    );

    const answer = await client.query({
      birth: BIRTH,
      sql: "SELECT 1",
      format: "box",
    });

    expect(answer).toBe(BOX);
  });

  it("keeps a PDF as bytes, which would not survive as text", async () => {
    const client = clientOver(
      new Uint8Array([0x25, 0x50, 0x44, 0x46, 0xe2, 0xe3, 0xcf, 0xd3]),
      "application/pdf",
    );

    expect(await client.exportPdf(BIRTH)).toBeInstanceOf(Uint8Array);
  });

  it.each(["text/csv", "image/svg+xml"])(
    "keeps %s as bytes, text on the wire and a file in practice",
    async (contentType) => {
      const client = clientOver(
        new TextEncoder().encode("name,sign\nSun,Leo\n"),
        contentType,
      );

      const answer = await client.request("POST", "/v1/export-csv", {
        binary: true,
        json: {},
      });

      expect(answer).toBeInstanceOf(Uint8Array);
    },
  );

  it.each([
    ["text/plain", true],
    ["text/plain; charset=utf-8", true],
    ["TEXT/PLAIN", true],
    ["  text/plain  ; charset=utf-8", true],
    ["text/csv", false],
    ["application/pdf", false],
    ["image/svg+xml", false],
    ["text/plaintext", false],
    ["", false],
    [null, false],
  ])("reads the header %j as text: %s", (header, expected) => {
    expect(isPlainText(header)).toBe(expected);
  });

  it("keeps an answer without a Content-Type as bytes", async () => {
    const client = clientOver(new Uint8Array([0, 1, 2]), undefined);

    const answer = await client.request("POST", "/v1/export-pdf", {
      binary: true,
      json: {},
    });

    expect(answer).toBeInstanceOf(Uint8Array);
  });
});
