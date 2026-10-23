// PATH: src/models/records/response.ts

/**
 * RESPONSE RECORDS: an answer as it came off the wire, its body read once
 *
 * Purpose:
 *   The transport reads a body once, as text or as bytes, and hands this
 *   record to the decoder, which decides what the body means. Reading once
 *   lets the retry decision look at an error body that the decoder later
 *   reports, without reading the stream twice.
 */

/**
 * A body read as text, which is how JSON, plain text, and every error envelope are read.
 *
 * @internal
 */
export interface TextBody {
  readonly kind: "text";
  readonly text: string;
}

/**
 * A body read as raw bytes, which is how a document such as a PNG, a PDF, or a CSV is read.
 *
 * @internal
 */
export interface BytesBody {
  readonly kind: "bytes";
  readonly bytes: Uint8Array;
}

/**
 * A response body, read the one way its kind names.
 *
 * @internal
 */
export type ResponseBody = TextBody | BytesBody;

/**
 * An answer the server sent, with its body read.
 *
 * @internal
 */
export interface ReceivedResponse {
  /** The HTTP status. */
  readonly status: number;
  /** The response headers. */
  readonly headers: Headers;
  /** The body, read once. */
  readonly body: ResponseBody;
}
