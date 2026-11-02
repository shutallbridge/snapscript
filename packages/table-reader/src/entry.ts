// What the reader keeps from the project's entry text: its hidden lines, and the names they import.

import { codeLines, HIDDEN } from "./program.ts";

/**
 * The entry text's `[import]` and `[extern]` lines, each with the comment lines just above it,
 * exactly as written. Hidden lines that sat next to each other stay together, and the rest are
 * set apart by one blank line.
 */
export function hiddenLines(entryText: string): string {
  const lines = entryText.split("\n");
  const chunks: { first: number; last: number }[] = [];
  codeLines(lines, (code, i, commentFrom) => {
    if (HIDDEN.test(code.replace(/\/\*.*?\*\//g, ""))) chunks.push({ first: commentFrom ?? i, last: i });
  });

  let out = "";
  chunks.forEach((c, n) => {
    if (n > 0) out += c.first === chunks[n - 1].last + 1 ? "\n" : "\n\n";
    out += lines.slice(c.first, c.last + 1).join("\n");
  });
  return out;
}

const IMPORT = /\[import[({]([^)}]*)[)}](?:as[({]([^)}]*)[)}])?\]/g;

/**
 * Package name → the local name the program imports it as. A package imported without `as(…)`
 * binds to nothing (it's a `SyntaxError`), so its cards are unknown.
 */
export function importedNames(hidden: string): Map<string, string> {
  const names = new Map<string, string>();
  for (const [, source, as] of hidden.matchAll(IMPORT)) {
    if (as && !names.has(source)) names.set(source, as);
  }
  return names;
}
