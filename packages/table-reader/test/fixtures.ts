// Hand-written table states for the step function. Language cards take their marker IDs from the
// language markers (`language/markers.yaml`, through @snapscript/core); library cards and pages take
// the fixture lockfile's, from 400. Lengths follow the card sheet rule (#101): handwritten cards at
// least 4U, [define{…}] 5U.
import { languageMarkers } from "@snapscript/core";
import type {
  GuideSources,
  Layout,
  Lockfile,
  ReaderState,
  StepOutput,
  TableCard,
  TableState,
} from "../src/index.ts";
import { initialState, step } from "../src/index.ts";

export const U = 30;

export { languageMarkers };

/** The language marker of a card at a length (its shortest, if it has one only). */
export function marker(card: string, length?: number): number {
  const ids = [...languageMarkers].filter(([, m]) => m.card === card && (length === undefined || m.length === length));
  if (ids.length !== 1) throw new Error(`no one language marker for ${card} ${length ?? ""}`);
  return ids[0]![0];
}

export const DEFINE: number = marker("[define{}]", 5);
export const REPEAT: number = marker("[repeat]");
export const SET: number = marker("[set{}to]", 4);
export const GET: number = marker("[get{}]", 4);
export const DEDENT: number = marker("[dedent]");
export const NUM: number = marker("[num{}]", 4);
export const ON_LOAD: number = marker("[on(load)]");
export const GLOBAL: number = marker("[global{}]", 5);
export const IF: number = marker("[if]");
export const GOLD: number = marker("[color(gold)]");

/**
 * The 3U `[call(p5.circle)]`, `[call(p5.createCanvas)]`, a library the programs don't import, a
 * page, and the printed `[define(setup)]`.
 */
export const CIRCLE: number = 400;
export const CREATE_CANVAS: number = 401;
export const PLAY: number = 402;
export const PAGE: number = 403;
export const SETUP: number = 404;

export const lockfile: Lockfile = new Map([
  [CIRCLE, { kind: "library", card: "call", package: "snapscript-p5", name: "circle", length: 3 }],
  [CREATE_CANVAS, { kind: "library", card: "call", package: "snapscript-p5", name: "createCanvas", length: 4 }],
  [PLAY, { kind: "library", card: "call", package: "snapscript-sound", name: "play", length: 3 }],
  [PAGE, { kind: "page", textbook: "snapscript-p5-getting-started", volume: "confetti", page: 3 }],
  [SETUP, { kind: "library", card: "define", package: "snapscript-p5", name: "setup", length: 4 }],
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

/** The buffer's program lines, without its `/** @table … *\/` lines, for tests about what the cards say. */
export function code(text: string): string {
  return text
    .split("\n")
    .filter((l) => !/^\/\*\* @table .* \*\/$/.test(l))
    .join("\n");
}

export function textOf(...tables: TableState[]): string {
  return code(run(...tables).last.text);
}

/** Where a virtual card's marker sits when its top-left corner lies at (x, y), turned `angle`. */
export function at(x: number, y: number, angle = 0): { x: number; y: number; angle: number } {
  const c = card(0, 0, x, y, { angle });
  return { x: c.x, y: c.y, angle };
}

/**
 * Steps through table states laid at the given times (in s), from an entry text, with guide sources
 * (or a function giving them from the state before each step).
 */
export function play(
  entry: string,
  moments: { t: number; cards: TableCard[] }[],
  guideSources?: GuideSources | ((prev: ReaderState) => GuideSources),
): { outputs: StepOutput[]; last: StepOutput; state: ReaderState } {
  let state = initialState(entry);
  const outputs: StepOutput[] = [];
  for (const m of moments) {
    const sources = typeof guideSources === "function" ? guideSources(state) : guideSources;
    const r = step(state, {
      table: { ...table(...m.cards), t: m.t },
      layout,
      lockfile,
      languageMarkers,
      guideSources: sources,
    });
    state = r.state;
    outputs.push(r.output);
  }
  return { outputs, last: outputs[outputs.length - 1], state };
}

/** The ids of the virtual cards an output draws. */
export const ids = (out: StepOutput): string[] => out.virtualCards.map((v) => v.id);
