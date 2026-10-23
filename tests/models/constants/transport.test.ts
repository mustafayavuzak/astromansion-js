// PATH: tests/models/constants/transport.test.ts

/**
 * TRANSPORT CONSTANTS TESTS: the Retry-After pattern keeps the promises of its documentation
 *
 * Purpose:
 *   The pattern's TSDoc draws the pattern and lists the inputs it accepts and
 *   refuses. This test reads that TSDoc from the source, so the drawing, the
 *   examples, and the pattern cannot drift apart.
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { RETRY_AFTER } from "../../../src/models/constants/transport.ts";

/** The TSDoc block that documents the Retry-After pattern, read from the source. */
const PATTERN_DOC = documentationOf(
  readFileSync(
    new URL("../../../src/models/constants/transport.ts", import.meta.url),
    "utf8",
  ),
  "SECONDS_PATTERN:",
);

/**
 * Cut the TSDoc block that precedes a declaration.
 *
 * @param source - The source file's text.
 * @param declaration - The text that opens the declaration.
 * @returns The lines of the TSDoc block right above the declaration.
 */
function documentationOf(source: string, declaration: string): string[] {
  const end = source.indexOf(declaration);
  const start = source.lastIndexOf("/**", end);
  return source.slice(start, end).split("\n");
}

/**
 * Collect the inputs quoted with backticks on the line that opens with a label.
 *
 * @param lines - The TSDoc block's lines.
 * @param label - The word that opens the line, such as Accepts.
 * @returns The quoted inputs, in their order.
 */
function quotedOn(lines: readonly string[], label: string): string[] {
  const line =
    lines.find((candidate) => candidate.trim().startsWith(`* ${label}`)) ?? "";
  return line.split("`").filter((_part, index) => index % 2 === 1);
}

describe("RETRY_AFTER.SECONDS_PATTERN", () => {
  it("is the pattern its drawing spells", () => {
    const drawing =
      PATTERN_DOC.find((line) => line.trim().startsWith("* ^")) ?? "";
    const spelled = drawing.trim().slice(1).replaceAll(" ", "");

    expect(spelled).toBe(RETRY_AFTER.SECONDS_PATTERN.source);
  });

  it("accepts every input its documentation accepts", () => {
    const accepted = quotedOn(PATTERN_DOC, "Accepts");

    expect(accepted.length).toBeGreaterThan(0);
    expect(
      accepted.filter((input) => !RETRY_AFTER.SECONDS_PATTERN.test(input)),
    ).toEqual([]);
  });

  it("refuses every input its documentation refuses, and empty text", () => {
    const refused = [...quotedOn(PATTERN_DOC, "Refuses"), ""];

    expect(refused.length).toBeGreaterThan(1);
    expect(
      refused.filter((input) => RETRY_AFTER.SECONDS_PATTERN.test(input)),
    ).toEqual([]);
  });
});
