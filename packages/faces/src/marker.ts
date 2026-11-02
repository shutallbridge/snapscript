// A marker in tagStandard41h12, as the camera reads it.

import { BIT_X, BIT_Y, CODES } from "./tag-family.ts";

/** The family's 9 × 9 cells, the 5 × 5 border starting at cell 2 (a reversed border: its ring is white). */
const CELLS = 9;
const BORDER_START = 2;
const BORDER_WIDTH = 5;

/** Marker `id`'s 9 rows of 9 cells, as printed, row 0 at the top: true where the cell is black. */
export function markerPattern(id: number): boolean[][] {
  const code = CODES[id];
  if (code === undefined || !Number.isInteger(id)) throw new RangeError(`tagStandard41h12 has no marker ${id}`);
  const white = Array.from({ length: CELLS }, () => Array<boolean>(CELLS).fill(false));
  const last = BORDER_START + BORDER_WIDTH - 1;
  for (let i = BORDER_START; i <= last; i++) {
    white[BORDER_START]![i] = white[last]![i] = white[i]![BORDER_START] = white[i]![last] = true;
  }
  const bits = BigInt("0x" + code);
  const n = BIT_X.length;
  for (let i = 0; i < n; i++) {
    if ((bits >> BigInt(n - i - 1)) & 1n) white[BIT_Y[i]! + BORDER_START]![BIT_X[i]! + BORDER_START] = true;
  }
  return white.map((row) => row.map((w) => !w));
}

/** Marker `id` as SVG, `size` mm square with its top-left at (x, y): a black rect per black cell. */
export function markerSvg(id: number, x: number, y: number, size: number): string {
  const cell = size / CELLS;
  const rects = markerPattern(id).flatMap((row, i) =>
    row.flatMap((black, j) =>
      // A hair over a cell, so neighbouring cells print without a seam.
      black ? [`<rect x="${mm(x + j * cell)}" y="${mm(y + i * cell)}" width="${mm(cell + 0.02)}" height="${mm(cell + 0.02)}"/>`] : [],
    ),
  );
  return `<g data-part="marker" data-id="${id}" fill="#000">${rects.join("")}</g>`;
}

/** A length in mm, written short. */
export const mm = (n: number): string => String(Math.round(n * 1000) / 1000);
