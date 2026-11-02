// Replaying table states recorded on the rig (#166) through the step function, for the rig replay
// tests and the end-to-end fixture (#173).
import { readFileSync } from "node:fs";
import { languageMarkers } from "@snapscript/core";
import type { Layout, Lockfile, StepOutput, TableCard } from "../../src/index.ts";
import { initialState, step } from "../../src/index.ts";

// The recordings were made with the prototypes' paper cards (their `cards.json`), which carry the
// prototype's marker IDs. The adapter reads each recorded marker as the card it was printed as, and
// gives the step function that card's marker today: a language card's from the language markers, a
// library card's from the lockfile below. 1000–1022 are demo program 1's first block.
const p5 = (name: string, length: number) =>
  ({ kind: "library", card: "call", package: "snapscript-p5", name, length }) as const;
export const CREATE_CANVAS: number = 400;
export const BACKGROUND: number = 401;
export const NO_STROKE: number = 402;
export const FILL: number = 403;
export const RECT: number = 404;
export const lockfile: Lockfile = new Map([
  [CREATE_CANVAS, p5("createCanvas", 4)],
  [BACKGROUND, p5("background", 3)],
  [NO_STROKE, p5("noStroke", 3)],
  [FILL, p5("fill", 2)],
  [RECT, p5("rect", 2)],
]);
export { languageMarkers };

/** The language marker of a printed card, at its length. */
function language(card: string, length: number): number {
  const id = [...languageMarkers].find(([, m]) => m.card === card && m.length === length)?.[0];
  if (id === undefined) throw new Error(`no language marker for ${card} ${length}U`);
  return id;
}

/** The prototype's printed marker IDs, as the cards they were printed on. */
const printed: ReadonlyMap<number, number> = new Map([
  [1000, language("[define{}]", 5)],
  ...[1002, 1003, 1010, 1013, 1016, 1020, 1021].map((id) => [id, language("[num{}]", 4)] as const),
  [1005, language("[color(mediumblue)]", 4)],
  [1008, language("[color(gold)]", 4)],
  [1009, language("[repeat]", 2)],
  [1011, language("[set{}to]", 4)],
  [1014, language("[set{}to]", 4)],
  [1012, language("[call(random)]", 2)],
  [1015, language("[call(random)]", 2)],
  [1018, language("[get{}]", 4)],
  [1019, language("[get{}]", 4)],
  [1022, language("[dedent]", 2)],
  [1001, CREATE_CANVAS],
  [1004, BACKGROUND],
  [1006, NO_STROKE],
  [1007, FILL],
  [1017, RECT],
]);

// The coding space's right edge was at 592.5 mm (`SPLIT_MM` in the prototype's replay script).
export const layout: Layout = {
  codingSpace: { x: 0, y: 0, width: 592.5, height: 1000 },
  canvasSpace: { x: 592.5, y: 0, width: 592.5, height: 1000 },
  corners: [],
};

export const ENTRY = "[import(snapscript-p5)as(p5)]";

export interface Replayed {
  /** Seconds from the run's first table state. */
  t: number;
  /** The cards of the table state stepped, as the step function was given them. */
  cards: TableCard[];
  output: StepOutput;
}

/**
 * Feeds a recording through the step function. A recording row holds the vision service's cards in
 * `state` and its capture time in `t_cap`. These runs predate the rule that a card being read again
 * keeps its last text (#147), so the adapter puts the last text back, as the service now does.
 * The cards returned carry today's marker IDs.
 */
export function replay(name: string): Replayed[] {
  const rows: { t_cap: number; state: TableCard[] }[] = readFileSync(
    new URL(`./${name}.jsonl`, import.meta.url),
    "utf8",
  )
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));
  const lastText = new Map<number, string>();
  let state = initialState(ENTRY);
  return rows.map((row, seq) => {
    const cards = row.state.map((recorded) => {
      const marker = printed.get(recorded.marker);
      if (marker === undefined) throw new Error(`${name}: marker ${recorded.marker} wasn't a prototype card`);
      const c = { ...recorded, marker };
      if (c.hw?.text !== undefined) lastText.set(c.track, c.hw.text);
      else if (c.hw?.state === "reading" && lastText.has(c.track)) return { ...c, hw: { ...c.hw, text: lastText.get(c.track) } };
      return c;
    });
    const r = step(state, {
      table: { type: "state", seq, t: row.t_cap, mm_per_projector_height: 781, cards },
      layout,
      lockfile,
      languageMarkers,
    });
    state = r.state;
    return { t: row.t_cap - rows[0].t_cap, cards, output: r.output };
  });
}

