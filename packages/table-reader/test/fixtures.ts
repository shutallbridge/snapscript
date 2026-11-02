// Hand-written table states for the step function. Marker IDs follow the card feedback prototype (#129):
// 1000 [define{setup}], 1009 [repeat], 1011 [set{x}to], 1022 [dedent], 1024 [num{250}], 0 the 3U
// [call(p5.circle)] and so on. Lengths follow the card sheet rule (#101): handwritten cards at least 4U,
// [define{…}] 5U.
import type {
  Layout,
  LanguageMarkers,
  Lockfile,
  ReaderState,
  StepOutput,
  TableCard,
  TableState,
} from "../src/index.ts";
import { initialState, step } from "../src/index.ts";

export const U = 30;

export const languageMarkers: LanguageMarkers = new Map([
  [1000, { card: "[define{}]", length: 5 }],
  [1009, { card: "[repeat]", length: 2 }],
  [1011, { card: "[set{}to]", length: 4 }],
  [1018, { card: "[get{}]", length: 4 }],
  [1022, { card: "[dedent]", length: 2 }],
  [1024, { card: "[num{}]", length: 4 }],
  [1025, { card: "[num{}]", length: 4 }],
  [1026, { card: "[num{}]", length: 4 }],
  [1030, { card: "[on(load)]", length: 3 }],
  [1031, { card: "[global{}]", length: 5 }],
  [1032, { card: "[if]", length: 2 }],
]);

export const lockfile: Lockfile = new Map([
  [0, { kind: "library", card: "call", package: "snapscript-p5", name: "circle", length: 3 }],
  [1001, { kind: "library", card: "call", package: "snapscript-p5", name: "createCanvas", length: 4 }],
  [1500, { kind: "library", card: "call", package: "snapscript-sound", name: "play", length: 3 }],
  [1900, { kind: "page", textbook: "snapscript-p5-getting-started", volume: "confetti", page: 3 }],
]);

// The coding space is the left half of an 800 x 600 mm table, with a 100 mm help corner bottom-left.
export const layout: Layout = {
  codingSpace: { x: 0, y: 0, width: 400, height: 600 },
  canvasSpace: { x: 400, y: 0, width: 400, height: 600 },
  corners: [{ name: "help", x: 0, y: 600, radius: 100 }],
};

const MARKER_ALONG = 8.5;
const MARKER_DOWN = 15;

/** A card whose top-left corner lies at (x, y) mm, turned `angle` degrees clockwise. */
export function card(
  track: number,
  marker: number,
  x: number,
  y: number,
  opts: { angle?: number; text?: string } = {},
): TableCard {
  const angle = opts.angle ?? 0;
  const a = (angle * Math.PI) / 180;
  const u = [Math.cos(a), Math.sin(a)];
  const v = [-u[1], u[0]];
  const c: TableCard = {
    track,
    marker,
    x: x + MARKER_ALONG * u[0] + MARKER_DOWN * v[0],
    y: y + MARKER_DOWN * v[1] + MARKER_ALONG * u[1],
    angle,
  };
  if (opts.text !== undefined) c.hw = { state: "read", text: opts.text };
  return c;
}

let seq = 0;
export function table(...cards: TableCard[]): TableState {
  seq += 1;
  return { type: "state", seq, t: 1793598123 + seq, mm_per_projector_height: 781, cards };
}

/** Runs table states through the step function in turn, returning every output and the last state. */
export function run(...tables: TableState[]): { outputs: StepOutput[]; state: ReaderState; last: StepOutput } {
  return runFrom(undefined, ...tables);
}

/** The same, starting from a project's entry text. */
export function runFrom(
  entryText: string | undefined,
  ...tables: TableState[]
): { outputs: StepOutput[]; state: ReaderState; last: StepOutput } {
  let state = initialState(entryText);
  const outputs: StepOutput[] = [];
  for (const t of tables) {
    const r = step(state, { table: t, layout, lockfile, languageMarkers });
    state = r.state;
    outputs.push(r.output);
  }
  return { outputs, state, last: outputs[outputs.length - 1] };
}

export function textOf(...tables: TableState[]): string {
  return run(...tables).last.text;
}
