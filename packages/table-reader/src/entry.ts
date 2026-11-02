// What the reader keeps from the project's entry text: its hidden lines, and the names they import.

/** A line whose first card is an `[import]` or an `[extern]`: always `@table hidden`. */
const HIDDEN = /^\s*\[(import|extern)[({]/;

/**
 * The entry text's `[import]` and `[extern]` lines, each with the comment lines just above it,
 * exactly as written. Hidden lines that sat next to each other stay together, and the rest are
 * set apart by one blank line.
 */
export function hiddenLines(entryText: string): string {
  const lines = entryText.split("\n");
  const chunks: { first: number; last: number }[] = [];
  let pending: number | undefined; // the first comment line just above, if any
  let inComment = false;

  const declaration = (code: string, i: number): void => {
    if (HIDDEN.test(code)) chunks.push({ first: pending ?? i, last: i });
    pending = undefined;
  };

  lines.forEach((line, i) => {
    if (inComment) {
      const end = line.indexOf("*/");
      if (end < 0) return;
      inComment = false;
      const rest = line.slice(end + 2);
      if (rest.trim()) declaration(rest, i);
      return;
    }
    const t = line.trim();
    if (!t) {
      pending = undefined;
    } else if (t.startsWith("//")) {
      pending ??= i;
    } else if (t.startsWith("/*")) {
      pending ??= i;
      const end = t.indexOf("*/", 2);
      if (end < 0) inComment = true;
      else if (t.slice(end + 2).trim()) declaration(t.slice(end + 2), i);
    } else {
      declaration(line, i);
    }
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
