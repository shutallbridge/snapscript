// Text positions: an offset into a text, or a line and column in it. The checker's error spans are
// offsets and the reader's card spans are lines and columns; they meet only through these two.

/** A place in a text: line from 1, column from 0. A line's end is the column after its last letter. */
export interface LineColumn {
  line: number;
  column: number;
}

/** The line and column of an offset into the text, from 0 up to the text's length. */
export function lineColumnAt(text: string, offset: number): LineColumn {
  if (!Number.isInteger(offset) || offset < 0 || offset > text.length) {
    throw new RangeError(`offset ${offset} is outside a text of ${text.length} letters`);
  }
  let line = 1;
  let start = 0;
  for (let i = text.indexOf("\n"); i >= 0 && i < offset; i = text.indexOf("\n", i + 1)) {
    line += 1;
    start = i + 1;
  }
  return { line, column: offset - start };
}

/** The offset of a line and column in the text. */
export function offsetAt(text: string, { line, column }: LineColumn): number {
  let start = 0;
  for (let n = 1; n < line; n++) {
    const end = text.indexOf("\n", start);
    if (end < 0) throw new RangeError(`line ${line} is past the text's ${n} lines`);
    start = end + 1;
  }
  const end = text.indexOf("\n", start);
  const length = (end < 0 ? text.length : end) - start;
  if (line < 1 || !Number.isInteger(column) || column < 0 || column > length) {
    throw new RangeError(`line ${line}, column ${column} is outside the text`);
  }
  return start + column;
}
