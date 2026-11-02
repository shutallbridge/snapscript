// Replays of table states recorded on the rig (#166): the walking skeleton's (#115) and the steady table's
// (#147) `vision-*.jsonl` runs, cut down to the table states the vision service sent. They must give the
// lines the prototypes showed.
import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import type { Layout, LanguageMarkers, Lockfile, StepOutput, TableCard } from "../src/index.ts";
import { initialState, step } from "../src/index.ts";
import { code } from "./fixtures.ts";

// The prototypes' paper cards (their `cards.json`), with lengths from the card sheet rule they were
// printed by. 1000–1022 are demo program 1's first block.
const p5 = (name: string, length: number) =>
  ({ kind: "library", card: "call", package: "snapscript-p5", name, length }) as const;
const lockfile: Lockfile = new Map([
  [1001, p5("createCanvas", 4)],
  [1004, p5("background", 3)],
  [1006, p5("noStroke", 3)],
  [1007, p5("fill", 2)],
  [1017, p5("rect", 2)],
]);
const languageMarkers: LanguageMarkers = new Map([
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
const layout: Layout = {
  codingSpace: { x: 0, y: 0, width: 592.5, height: 1000 },
  canvasSpace: { x: 592.5, y: 0, width: 592.5, height: 1000 },
  corners: [],
};

const ENTRY = "[import(snapscript-p5)as(p5)]";

interface Replayed {
  /** Seconds from the run's first table state. */
  t: number;
  output: StepOutput;
}

/**
 * Feeds a recording through the step function. A recording row holds the vision service's cards in
 * `state` and its capture time in `t_cap`. These runs predate the rule that a card being read again
 * keeps its last text (#147), so the adapter puts the last text back, as the service now does.
 */
function replay(name: string): Replayed[] {
  const rows: { t_cap: number; state: TableCard[] }[] = readFileSync(
    new URL(`./rig/${name}.jsonl`, import.meta.url),
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
    return { t: row.t_cap - rows[0].t_cap, output: r.output };
  });
}

/** The program lines the cards make: the buffer without the entry's import and the `@table` tags. */
const lines = (o: StepOutput): string[] => code(o.text).split("\n").slice(2);
const between = (run: Replayed[], from: number, to = Infinity) => run.filter((r) => r.t >= from && r.t < to);

// #147's steady table: five paper cards, left alone for minutes beside 600 moving confetti.
const STEADY = ["[define{setup}]", "[call(p5.createCanvas)][num{500}][num{500}]", "[call(p5.background)]"];

describe("the steady table's run (#147)", () => {
  const run = replay("snap-147-vision-20261103-015737");

  test("settles on the five cards' lines and holds them, read, to the end", () => {
    const settled = between(run, 3.8);
    expect(settled.length).toBeGreaterThan(30);
    for (const r of settled) {
      expect(lines(r.output)).toEqual(STEADY);
      expect(r.output.skippedLines).toEqual([]);
      expect(r.output.detached).toEqual([]);
    }
  });

  test("changes nothing once settled: one buffer version, so nothing projected changes", () => {
    const versions = new Set(between(run, 3.8).map((r) => r.output.version));
    expect(versions.size).toBe(1);
  });
});

describe("the steady table's lift run (#147)", () => {
  const run = replay("snap-147-vision-20261103-012950");

  test("holds the five cards' lines until the first lift", () => {
    for (const r of between(run, 2.6, 56)) expect(lines(r.output)).toEqual(STEADY);
  });

  test("comes back to the same lines, in one strip, once the cards are put back", () => {
    const last = run[run.length - 1].output;
    expect(lines(last)).toEqual(STEADY);
    expect(last.stripHeads).toHaveLength(1);
    expect(last.skippedLines).toEqual([]);
  });
});

// The walking skeleton's paper cards, demo program 1's first block, laid by hand. Some sat a few mm
// apart and out of line the whole run (#147), so `[call(p5.rect)]` keeps only `[get{x}]`, as the
// prototype's reader showed with #147's join rules.
const DEMO_1 = [
  "[define{setup}]",
  "[call(p5.createCanvas)][num{500}][num{500}]",
  "[call(p5.background)][color(mediumblue)]",
  "[call(p5.noStroke)]",
  "[call(p5.fill)][color(gold)]",
  "[repeat][num{30}]",
  "  [set{x}to][call(random)][num{500}]",
  "  [set{y}to][call(random)][num{500}]",
  "  [call(p5.rect)][get{x}]",
  "[dedent]",
];

/**
 * The line, or the line with some handwriting not read yet, written as `{}`. (This run's vision
 * service also sent `blank` for an unread card at times, which the reader writes as `{}` without
 * skipping the line.)
 */
const unreadAllowed = (line: string): RegExp =>
  new RegExp(`^${line.replace(/[[\]().]/g, "\\$&").replace(/\{([^}]*)\}/g, "\\{(?:$1)?\\}")}$`);

describe("the walking skeleton's run (#115)", () => {
  const run = replay("snap-115-vision-20261102-224407");

  test("holds demo 1's lines from the first full read to the end, but for handwriting not read yet", () => {
    const held = between(run, 7.7);
    expect(held.length).toBeGreaterThan(100);
    for (const r of held) {
      const got = lines(r.output);
      expect(got).toHaveLength(DEMO_1.length);
      got.forEach((l, i) => expect(l).toMatch(unreadAllowed(DEMO_1[i])));
    }
    const read = held.filter((r) => lines(r.output).join("\n") === DEMO_1.join("\n"));
    expect(read.length / held.length).toBeGreaterThan(0.8);
  });

  test("ends on demo 1's lines, every card read", () => {
    const last = run[run.length - 1].output;
    expect(lines(last)).toEqual(DEMO_1);
    expect(last.skippedLines).toEqual([]);
  });
});
