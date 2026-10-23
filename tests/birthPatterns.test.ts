// PATH: tests/birthPatterns.test.ts

/**
 * BIRTH PATTERN TESTS: the Python SDK's tests/test_birth_patterns.py, case by case
 *
 * Purpose:
 *   Each birth pattern documents the inputs it accepts and refuses, and
 *   draws itself part by part. No tool reads a member's comment, so this
 *   test reads those lines from the source and checks them: every accepted
 *   input matches, every refused one does not, and the drawing, spaces
 *   removed, still spells the pattern.
 */

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { BIRTH_PATTERNS } from "../src/models/constants/birth.ts";

const SOURCE = await readFile(
  new URL("../src/models/constants/birth.ts", import.meta.url),
  "utf8",
);

/** The patterns, by their member names. */
const PATTERNS = Object.freeze({
  DATE: BIRTH_PATTERNS.DATE,
  TIME: BIRTH_PATTERNS.TIME,
});

/**
 * Read the comment written above one pattern, its stars removed.
 *
 * @param name - The pattern's member name.
 * @returns The comment's lines.
 */
function commentOf(name: string): readonly string[] {
  const at = SOURCE.indexOf(`  ${name}: /`);
  const start = SOURCE.lastIndexOf("/**", at);
  return SOURCE.slice(start, at)
    .split("\n")
    .map((line) => line.replace(/^\s*\/?\*+\/?\s?/, ""));
}

/**
 * Return the inputs a comment lists after a label.
 *
 * @param comment - The pattern's comment.
 * @param label - Accepts: or Refuses:.
 * @returns The inputs written between backquotes on that line.
 */
function listed(comment: readonly string[], label: string): readonly string[] {
  const line = comment.find((row) => row.startsWith(label)) ?? "";
  return line
    .slice(label.length)
    .split(",")
    .map((item) => item.trim().replace(/^`/, "").replace(/`$/, ""))
    .filter((item) => item !== "");
}

/**
 * Return the drawing's first line with its spaces removed.
 *
 * @param comment - The pattern's comment.
 * @returns The pattern as the drawing spells it.
 */
function drawing(comment: readonly string[]): string {
  const fence = comment.findIndex((row) => row.startsWith("```"));
  const first = comment.slice(fence + 1).find((row) => row.trim() !== "");
  return (first ?? "").replaceAll(" ", "");
}

describe("the birth patterns", () => {
  it.each(Object.entries(PATTERNS))(
    "matches what %s documents it accepts, and none of what it refuses",
    (name, pattern) => {
      const comment = commentOf(name);
      const accepted = listed(comment, "Accepts:");
      const refused = listed(comment, "Refuses:");

      expect(accepted.length).toBeGreaterThan(0);
      expect(refused.length).toBeGreaterThan(0);
      expect(accepted.every((text) => pattern.test(text))).toBe(true);
      expect(refused.some((text) => pattern.test(text))).toBe(false);
    },
  );

  it.each(Object.entries(PATTERNS))(
    "draws %s as the pattern spells it",
    (name, pattern) => {
      expect(drawing(commentOf(name))).toBe(pattern.source);
    },
  );
});
