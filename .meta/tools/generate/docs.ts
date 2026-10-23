// PATH: .meta/tools/generate/docs.ts

/**
 * DOCS: TSDoc comments written from the schema's prose and limits
 *
 * Purpose:
 *   The generated modules carry the API's own prose as TSDoc, so a caller
 *   reads a member's meaning and its limits where the member is used.
 *   Prose from the document is escaped for TSDoc outside its code spans,
 *   and the end of a comment can never appear inside one:
 *
 *     "Keys of `{technique, result}` <here>"   ──►   Keys of `{technique, result}` \<here\>
 *     limits {minimum: -90, maximum: 90}       ──►   At least -90. At most 90.
 */

import type { SchemaLimit } from "./openApi.ts";

/** How prose and limits are written into a comment. */
const DOCS_CONFIG = Object.freeze({
  /** The characters TSDoc reads as markup outside a code span, each escaped with a backslash. */
  TSDOC_SPECIALS: Object.freeze(["\\", "{", "}", "@", "<", ">"] as const),
  /** The escape TSDoc reads before a special character. */
  ESCAPE: "\\",
  /** The delimiter of a code span, and the doubled one the API's Python prose writes. */
  CODE_SPAN: "`",
  DOUBLE_CODE_SPAN: "``",
  /** What ends a comment, and the form it takes inside one. */
  COMMENT_END: "*/",
  COMMENT_END_ESCAPED: "*\\/",
  /** The opening, the line start, and the closing of a block comment, after the indentation. */
  BLOCK_OPEN: "/**",
  BLOCK_LINE: " *",
  BLOCK_CLOSE: " */",
  /** The TSDoc tag of a default value. */
  DEFAULT_TAG: "@defaultValue",
} as const);

/**
 * Build a TSDoc block comment.
 *
 * @param lines - The comment's lines, an empty line between paragraphs.
 * @param indent - The indentation the comment stands at.
 * @returns The comment, without a line break after it.
 *
 * @example
 * ```ts
 * docBlock(["The birth.", "", "At least -90."], "  ");
 * // "  /**\n   * The birth.\n   *\n   * At least -90.\n   *\/"
 * ```
 */
export function docBlock(lines: readonly string[], indent: string): string {
  return [
    `${indent}${DOCS_CONFIG.BLOCK_OPEN}`,
    ...lines.map((line) =>
      line === ""
        ? `${indent}${DOCS_CONFIG.BLOCK_LINE}`
        : `${indent}${DOCS_CONFIG.BLOCK_LINE} ${line}`,
    ),
    `${indent}${DOCS_CONFIG.BLOCK_CLOSE}`,
  ].join("\n");
}

/**
 * Join the paragraphs of a comment, an empty line between them.
 *
 * @param groups - Each paragraph's lines. An empty paragraph is left out.
 * @returns The comment's lines.
 *
 * @example
 * ```ts
 * paragraphs([["The birth."], [], ["At least -90."]]);   // ["The birth.", "", "At least -90."]
 * ```
 */
export function paragraphs(
  groups: readonly (readonly string[])[],
): readonly string[] {
  return groups
    .filter((lines) => lines.length > 0)
    .flatMap((lines, index) => (index === 0 ? lines : ["", ...lines]));
}

/**
 * Turn the document's prose into the lines of a comment.
 *
 * @param text - The prose, which may hold several paragraphs.
 * @returns Its lines, trimmed, with one empty line between paragraphs, the doubled code spans of the API's Python prose written single, and the markup TSDoc would misread escaped.
 *
 * @example
 * ```ts
 * docLines("Returns ``{technique, result}``.\n\nSee <docs>.");
 * // ["Returns `{technique, result}`.", "", "See \\<docs\\>."]
 * ```
 */
export function docLines(text: string): readonly string[] {
  const lines: string[] = [];
  for (const raw of text.split("\n")) {
    const line = raw
      .trim()
      .replaceAll(DOCS_CONFIG.DOUBLE_CODE_SPAN, DOCS_CONFIG.CODE_SPAN);
    if (line === "" && (lines.length === 0 || lines.at(-1) === "")) {
      continue;
    }
    lines.push(line === "" ? "" : escapedProse(line));
  }
  while (lines.at(-1) === "") {
    lines.pop();
  }
  return lines;
}

/**
 * Turn a value's limits into the lines of a comment.
 *
 * @param limits - The limits, in the order the schema keywords are listed.
 * @returns One line of sentences for the bounds, the length, the item count, the pattern, and the format, then the default as a TSDoc tag after an empty line. Empty when there are no limits.
 *
 * @example
 * ```ts
 * limitLines([{ keyword: "minimum", json: "-90" }, { keyword: "maximum", json: "90" }]);
 * // ["At least -90. At most 90."]
 * limitLines([{ keyword: "minItems", json: "1" }, { keyword: "default", json: "6" }]);
 * // ["At least 1 item.", "", "@defaultValue `6`"]
 * ```
 */
export function limitLines(limits: readonly SchemaLimit[]): readonly string[] {
  const sentences: string[] = [];
  const tags: string[] = [];
  for (const limit of limits) {
    switch (limit.keyword) {
      case "minimum":
        sentences.push(`At least ${limit.json}.`);
        break;
      case "exclusiveMinimum":
        sentences.push(`Greater than ${limit.json}.`);
        break;
      case "maximum":
        sentences.push(`At most ${limit.json}.`);
        break;
      case "exclusiveMaximum":
        sentences.push(`Less than ${limit.json}.`);
        break;
      case "minLength":
        sentences.push(`At least ${counted(limit.json, "character")} long.`);
        break;
      case "maxLength":
        sentences.push(`At most ${counted(limit.json, "character")} long.`);
        break;
      case "minItems":
        sentences.push(`At least ${counted(limit.json, "item")}.`);
        break;
      case "maxItems":
        sentences.push(`At most ${counted(limit.json, "item")}.`);
        break;
      case "pattern":
        sentences.push(`Matches the pattern ${codeSpan(textOf(limit.json))}.`);
        break;
      case "format":
        sentences.push(
          `Written in the ${escapedProse(textOf(limit.json))} format.`,
        );
        break;
      case "default":
        tags.push(`${DOCS_CONFIG.DEFAULT_TAG} ${codeSpan(limit.json)}`);
        break;
    }
  }
  return paragraphs([
    sentences.length === 0 ? [] : [sentences.join(" ")],
    tags,
  ]);
}

/**
 * Write a count with its noun.
 *
 * @param json - The count as JSON text.
 * @param noun - The noun in the singular.
 * @returns The count and the noun, in the plural unless the count is one.
 *
 * @example
 * ```ts
 * counted("1", "item");    // "1 item"
 * counted("20", "item");   // "20 items"
 * ```
 */
function counted(json: string, noun: string): string {
  return json === "1" ? `${json} ${noun}` : `${json} ${noun}s`;
}

/**
 * Escape one line of prose for TSDoc, outside its code spans.
 *
 * @param line - The line.
 * @returns The line with TSDoc's markup characters escaped where they are prose, and no comment end left in it.
 */
function escapedProse(line: string): string {
  return line
    .split(DOCS_CONFIG.CODE_SPAN)
    .map((part, index) => (index % 2 === 0 ? escapedMarkup(part) : part))
    .join(DOCS_CONFIG.CODE_SPAN)
    .replaceAll(DOCS_CONFIG.COMMENT_END, DOCS_CONFIG.COMMENT_END_ESCAPED);
}

/**
 * Escape TSDoc's markup characters.
 *
 * @param text - Prose outside a code span.
 * @returns The text with each markup character behind a backslash.
 */
function escapedMarkup(text: string): string {
  let escaped = text;
  for (const special of DOCS_CONFIG.TSDOC_SPECIALS) {
    escaped = escaped.replaceAll(special, `${DOCS_CONFIG.ESCAPE}${special}`);
  }
  return escaped;
}

/**
 * Write a value as a code span, or as escaped prose when it holds the span's own delimiter.
 *
 * @param value - The value's text.
 * @returns The span, safe inside a comment.
 */
function codeSpan(value: string): string {
  if (value.includes(DOCS_CONFIG.CODE_SPAN)) {
    return escapedProse(value);
  }
  return `${DOCS_CONFIG.CODE_SPAN}${value}${DOCS_CONFIG.CODE_SPAN}`.replaceAll(
    DOCS_CONFIG.COMMENT_END,
    DOCS_CONFIG.COMMENT_END_ESCAPED,
  );
}

/**
 * Read the text a JSON string holds.
 *
 * @param json - JSON text, a string for a pattern or a format.
 * @returns The string's text, or the JSON text itself when it holds no string.
 */
function textOf(json: string): string {
  const value: unknown = JSON.parse(json);
  return typeof value === "string" ? value : json;
}
