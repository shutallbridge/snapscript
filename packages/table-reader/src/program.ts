// Text → cards: reading a program text's strips back into the cards they are made of.


/** Where a strip's `@table` tag puts it. */
export type TablePlace = { x: number; y: number; turn: number } | "auto" | "hidden";

export interface TextLine {
  /** Its indent, in U from the strip's head. */
  column: number;
  cards: string[];
}

/** A strip of a program text: its head's doc comment, where it lies, and its lines of cards. */
export interface TextStrip {
  /** The doc comment just above its head, as written, if it has one. */
  doc?: string;
  table: TablePlace;
  lines: TextLine[];
  /** The strip exactly as written, from its comments down to its last line. */
  verbatim: string;
}

/** A line whose first card is an `[import]` or an `[extern]`: always `@table hidden`. */
export const HIDDEN: RegExp = /^\s*\[(import|extern)[({]/;

/** `[define{…}]`, `[on(…)]` and `[global{…}]` start a strip. */
export const STANDS_ALONE: RegExp = /^\[(define|on|global)[{(]/;

/** Every card on a line, in order: brackets can't be written inside a card. */
const CARD = /\[[^\]]*\]/g;

/**
 * Calls `code` for each line of a program text that has code outside comments, with its index and
 * the first of the comment lines just above it, if any. A line that starts with a one-line comment
 * comes whole; a line that ends a longer comment comes from just after it.
 */
export function codeLines(
  lines: readonly string[],
  code: (text: string, i: number, commentFrom: number | undefined) => void,
): void {
  let pending: number | undefined;
  let inComment = false;
  const found = (text: string, i: number): void => {
    if (!text.trim()) return;
    code(text, i, pending);
    pending = undefined;
  };
  lines.forEach((line, i) => {
    if (inComment) {
      const end = line.indexOf("*/");
      if (end < 0) return;
      inComment = false;
      found(line.slice(end + 2), i);
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
      else if (t.slice(end + 2).trim()) found(line, i);
    } else {
      found(line, i);
    }
  });
}

/** What a `@table` tag says, from a doc comment: one it can't read counts as `auto`. */
function tablePlace(doc: string | undefined): TablePlace {
  const m = doc?.match(/@table\b([^\n]*?)(?:\*\/|$)/m);
  if (!m) return "auto";
  const words = m[1].trim().split(/\s+/);
  if (words.length === 1 && (words[0] === "hidden" || words[0] === "auto")) return words[0];
  if ((words.length === 2 || words.length === 3) && words.every((w) => /^-?\d+$/.test(w))) {
    const [x, y, turn = 0] = words.map(Number);
    return { x, y, turn };
  }
  return "auto";
}

/**
 * A program text's strips, in order. Its `[import]` and `[extern]` lines are left out (the reader
 * keeps them as written), and so is code that comes before any strip's head.
 */
export function textStrips(text: string): TextStrip[] {
  const lines = text.split("\n");
  const strips: (TextStrip & { first: number; last: number })[] = [];
  let current: (TextStrip & { first: number; last: number }) | undefined;

  const code = (raw: string, i: number, pending: number | undefined): void => {
    const body = raw.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
    const cards = body.match(CARD) ?? [];
    if (!cards.length) return;
    if (HIDDEN.test(body)) {
      current = undefined;
    } else if (STANDS_ALONE.test(cards[0]!)) {
      const first = pending ?? i;
      const above = lines.slice(first, i + 1).join("\n");
      const docStart = above.lastIndexOf("/**");
      const doc = docStart < 0 ? undefined : above.slice(docStart, above.indexOf("*/", docStart) + 2);
      current = { doc, table: tablePlace(doc), lines: [], verbatim: "", first, last: i };
      strips.push(current);
      current.lines.push({ column: 0, cards });
    } else if (current) {
      const indent = body.length - body.trimStart().length;
      current.lines.push({ column: Math.floor(indent / 2), cards });
      current.last = i;
    }
  };

  codeLines(lines, code);

  return strips.map(({ first, last, ...s }) => ({ ...s, verbatim: lines.slice(first, last + 1).join("\n") }));
}
