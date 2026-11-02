// Replaying table states recorded on the rig (#166) through the step function, for the rig replay
// tests and the end-to-end fixture (#173).
import { readFileSync } from "node:fs";
import type { Layout, LanguageMarkers, Lockfile, StepOutput, TableCard } from "../../src/index.ts";
import { initialState, step } from "../../src/index.ts";

// The prototypes' paper cards (their `cards.json`), with lengths from the card sheet rule they were
// printed by. 1000–1022 are demo program 1's first block.
const p5 = (name: string, length: number) =>
  ({ kind: "library", card: "call", package: "snapscript-p5", name, length }) as const;
export const lockfile: Lockfile = new Map([
  [1001, p5("createCanvas", 4)],
  [1004, p5("background", 3)],
  [1006, p5("noStroke", 3)],
  [1007, p5("fill", 2)],
  [1017, p5("rect", 2)],
]);
export const languageMarkers: LanguageMarkers = new Map([
  [1000, { card: "[define{}]", length: 5 }],
  ...[1002, 1003, 1010, 1013, 1016, 1020, 1021].map((id) => [id, { card: "[num{}]", length: 4 }] as const),
  [1005, { card: "[color(mediumblue)]", length: 4 }],
  [1008, { card: "[color(gold)]", length: 4 }],
  [1009, { card: "[repeat]", length: 2 }],
  [1011, { card: "[set{}to]", length: 4 }],
  [1014, { card: "[set{}to]", length: 4 }],
  [1012, { card: "[call(random)]", length: 2 }],
  [1015, { card: "[call(random)]", length: 2 }],
  [1018, { card: "[get{}]", length: 4 }],
  [1019, { card: "[get{}]", length: 4 }],
  [1022, { card: "[dedent]", length: 2 }],
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
    const cards = row.state.map((c) => {
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

