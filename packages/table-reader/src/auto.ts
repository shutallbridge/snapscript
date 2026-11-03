// `@table auto` (REFERENCE.md §1.1, #157): where the system lays a file's auto strips.

import { shortestLength } from "@snapscript/faces";
import type { TextStrip } from "./program.ts";

/** The first strip lies this many U from the coding space's top and left edges. */
const MARGIN_U = 4;
/** Each next strip lies this many U below the last, and each next column this many U right of the widest strip. */
const GAP_U = 2;

/**
 * Where each of a file's auto strips lies, in file order: its first card's top-left corner, in mm
 * from the coding space's top-left. They stack down the left of the coding space, each card at its
 * shortest length, and a column that runs out of room starts the next. Only the strips before a
 * strip move it, and real cards never do.
 */
export function autoPlaces(strips: readonly TextStrip[], heightMm: number, unitMm: number): { x: number; y: number }[] {
  const margin = MARGIN_U * unitMm;
  const gap = GAP_U * unitMm;
  let x = margin;
  let y = margin;
  let widest = 0;
  let first = true;
  return strips.map((strip) => {
    const height = strip.lines.length * unitMm;
    const width =
      Math.max(...strip.lines.map((l) => l.column + l.cards.reduce((n, card) => n + shortestLength(card), 0))) * unitMm;
    // A strip too tall for any column still starts one.
    if (!first && y + height > heightMm) {
      x += widest + gap;
      y = margin;
      widest = 0;
    }
    first = false;
    const place = { x, y };
    y += height + gap;
    widest = Math.max(widest, width);
    return place;
  });
}
