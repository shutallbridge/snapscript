// Replays of table states recorded on the rig (#166): the walking skeleton's (#115) and the steady table's
// (#147) `vision-*.jsonl` runs, cut down to the table states the vision service sent. They must give the
// lines the prototypes showed.
import { describe, expect, test } from "vitest";
import type { StepOutput } from "../src/index.ts";
import { code } from "./fixtures.ts";
import { type Replayed, replay } from "./rig/replay.ts";

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
