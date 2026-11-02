// Hand-written table states and an in-memory project for the table session's tests.
import { languageMarkers } from "@snapscript/core";
import type { Layout, TableCard, TableState } from "@snapscript/table-reader";
import { run, type RunError } from "@snapscript/runtime";
import type { SessionProject } from "../src/session.ts";

/** The language marker of a card at a length (its shortest, if it has one only). */
export function marker(card: string, length?: number): number {
  const ids = [...languageMarkers].filter(([, m]) => m.card === card && (length === undefined || m.length === length));
  if (ids.length !== 1) throw new Error(`no one language marker for ${card} ${length ?? ""}`);
  return ids[0]![0];
}

export const PRINT: number = marker("[call(print)]");
export const NUM: number = marker("[num{}]", 4);
export const ON_LOAD: number = marker("[on(load)]");
export const DEFINE: number = marker("[define{}]", 5);
export const GET: number = marker("[get{}]", 4);
export const DIVIDE: number = marker("[/]");

/** 1U, in mm. */
export const U = 30;

// The coding space is the left half of an 800 x 600 mm table.
export const layout: Layout = {
  codingSpace: { x: 0, y: 0, width: 400, height: 600 },
  canvasSpace: { x: 400, y: 0, width: 400, height: 600 },
  corners: [],
};

/** A project with no libraries: the entry module is empty and nothing can be imported. */
export const project: SessionProject = {
  entry: { id: "/project/main.snap", text: "" },
  loader: { load: () => null },
  lockfile: new Map(),
  languageMarkers,
};

/** A card whose top-left corner lies at (x, y) mm, upright; a handwritten one read as `text`. */
export function card(track: number, marker: number, x: number, y: number, text?: string): TableCard {
  const c: TableCard = { track, marker, x: x + 8.5, y: y + 15, angle: 0 };
  if (text !== undefined) c.hw = { state: "read", text };
  return c;
}

/** A table state at `t` seconds. */
export function table(t: number, ...cards: TableCard[]): TableState {
  return { type: "state", seq: Math.round(t * 1000), t, mm_per_projector_height: 781, cards };
}

/** A card to lay: its marker, and its handwriting's text if it has any. */
export type Laid = [marker: number, text?: string];

/**
 * A strip with its head's top-left at (x, y): the head, then each line under it (a `[define]` or
 * `[on(…)]` doesn't indent its body), its cards end to end at their lengths. Tracks from `track` up, in the order given.
 */
export function strip(track: number, x: number, y: number, head: Laid, ...lines: Laid[][]): TableCard[] {
  const cards = [card(track, head[0], x, y, head[1])];
  lines.forEach((line, i) => {
    let along = x;
    for (const [m, text] of line) {
      cards.push(card(track + cards.length, m, along, y + (i + 1) * U, text));
      along += languageMarkers.get(m)!.length * U;
    }
  });
  return cards;
}

/**
 * An `[on(load)]` strip with its head's top-left at (x, y), and a `[call(print)][num{n}]` line under
 * it for each number: tracks from `track` up, head first.
 */
export function onLoad(track: number, x: number, y: number, ...numbers: string[]): TableCard[] {
  return strip(track, x, y, [ON_LOAD], ...numbers.map((n): Laid[] => [[PRINT], [NUM, n]]));
}

/** Runs a start command's JS as the sketch view would, with no native modules, and gives the errors it reports. */
export function runErrors(js: string): RunError[] {
  const errors: RunError[] = [];
  run(js, { natives: () => null, output: { print() {}, error: (e) => errors.push(e), frame() {} } });
  return errors;
}
