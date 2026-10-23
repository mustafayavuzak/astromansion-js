// PATH: tests/meta/tools/generate/docs.test.ts

/**
 * GENERATOR DOCS TESTS: the API's prose and limits, written as TSDoc
 */

import { describe, expect, it } from "vitest";
import {
  docBlock,
  docLines,
  limitLines,
  paragraphs,
} from "../../../../.meta/tools/generate/docs.ts";
import type { SchemaLimit } from "../../../../.meta/tools/generate/openApi.ts";

describe("docLines", () => {
  it("escapes TSDoc's markup outside a code span and keeps it inside one", () => {
    expect(
      docLines("Answers `{technique, result}` and {more} <here> @once."),
    ).toEqual([
      "Answers `{technique, result}` and \\{more\\} \\<here\\> \\@once.",
    ]);
  });

  it("writes the doubled code spans of Python prose single", () => {
    expect(docLines("``type`` picks the card.")).toEqual([
      "`type` picks the card.",
    ]);
  });

  it("keeps one empty line between paragraphs and none at either end", () => {
    expect(docLines("\n  First.\n\n\n  Second.  \n\n")).toEqual([
      "First.",
      "",
      "Second.",
    ]);
  });

  it("never lets a comment end through", () => {
    expect(docLines("a */ b")).toEqual(["a *\\/ b"]);
  });
});

describe("limitLines", () => {
  it.each<[string, SchemaLimit[], string[]]>([
    [
      "bounds",
      [
        { keyword: "minimum", json: "-90" },
        { keyword: "maximum", json: "90" },
      ],
      ["At least -90. At most 90."],
    ],
    [
      "one item, in the singular",
      [{ keyword: "minItems", json: "1" }],
      ["At least 1 item."],
    ],
    [
      "a length",
      [{ keyword: "maxLength", json: "120" }],
      ["At most 120 characters long."],
    ],
    [
      "a pattern",
      [{ keyword: "pattern", json: '"^(tr|en)$"' }],
      ["Matches the pattern `^(tr|en)$`."],
    ],
    [
      "a default, as a tag after the sentences",
      [
        { keyword: "minimum", json: "1" },
        { keyword: "default", json: "6" },
      ],
      ["At least 1.", "", "@defaultValue `6`"],
    ],
  ])("writes %s", (_case, limits, lines) => {
    expect(limitLines(limits)).toEqual(lines);
  });

  it("writes nothing without limits", () => {
    expect(limitLines([])).toEqual([]);
  });
});

describe("paragraphs", () => {
  it("joins the paragraphs that hold lines, an empty line between them", () => {
    expect(paragraphs([["The birth."], [], ["At least -90."]])).toEqual([
      "The birth.",
      "",
      "At least -90.",
    ]);
  });
});

describe("docBlock", () => {
  it("writes an indented block comment", () => {
    expect(docBlock(["The birth.", "", "At least -90."], "  ")).toBe(
      ["  /**", "   * The birth.", "   *", "   * At least -90.", "   */"].join(
        "\n",
      ),
    );
  });
});
