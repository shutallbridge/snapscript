// The end-to-end fixture (#173): table states recorded on the rig, through the step function, and
// its buffer text and `skippedLines` through `check`. The errors and skipped lines must be the ones
// the prototypes showed for the same recordings, and each error must map back to the cards it blames
// through the reader's card-to-text map. The checker is a devDependency only: the reader never
// imports it.
import { check, type CheckError, type CheckResult, type ModuleLoader } from "@snapscript/checker";
import { describe, expect, test } from "vitest";
import type { Span, StepOutput } from "../src/index.ts";
import { type Replayed, replay } from "./rig/replay.ts";

// A made-up snapscript-p5 with just the functions the recorded cards call, as the real one declares
// them in batch 2. `random` is a builtin.
const P5 = [
  "[extern(createCanvas)][required(width)][required(height)]",
  "[extern(background)][required(color)]",
  "[extern(noStroke)]",
  "[extern(fill)][required(color)]",
  "[extern(fill)][required(r)][required(g)][required(b)]",
  "[extern(rect)][required(x)][required(y)][required(w)][required(h)]",
  "",
].join("\n");

const loader: ModuleLoader = {
  load: (source) => (source === "snapscript-p5" ? { id: "node_modules/snapscript-p5/p5.snap", text: P5 } : null),
};

interface Checked {
  replayed: Replayed;
  result: CheckResult;
}

/** Every table state of a recording, through the reader and then the checker. */
function endToEnd(name: string): Checked[] {
  return replay(name).map((replayed) => ({
    replayed,
    result: check(replayed.output.text, replayed.output.skippedLines, { loader }),
  }));
}

const between = (run: Checked[], from: number, to = Infinity) =>
  run.filter((r) => r.replayed.t >= from && r.replayed.t < to);

/**
 * A text offset as the reader's text positions give it: line from 1, column from 0. The checker's
 * spans are offsets into the text, the reader's card spans are lines and columns.
 */
function position(text: string, offset: number): { line: number; column: number } {
  const before = text.slice(0, offset).split("\n");
  return { line: before.length, column: before[before.length - 1].length };
}

/** The tracks of the cards an error's spans cover, through the reader's card-to-text map. */
function tracksOf(error: CheckError, output: StepOutput): number[] {
  const tracks: number[] = [];
  for (const s of error.spans) {
    const from = position(output.text, s.start);
    const to = position(output.text, s.end);
    for (const c of output.map.cards) {
      if (!("track" in c)) continue;
      if (covers(c.span, from, to)) tracks.push(c.track);
    }
  }
  return tracks;
}

function covers(card: Span, from: { line: number; column: number }, to: { line: number; column: number }): boolean {
  const after = (a: { line: number; column: number }, line: number, column: number) =>
    a.line < line || (a.line === line && a.column <= column);
  return after(from, card.line, card.start) && after({ line: card.line, column: card.end }, to.line, to.column);
}

/** The marker IDs of the cards an error blames. */
function markersOf(error: CheckError, r: Checked): number[] {
  return tracksOf(error, r.replayed.output).map((t) => r.replayed.cards.find((c) => c.track === t)!.marker);
}

const summary = (r: Checked) => ({
  errors: r.result.errors.map(({ kind, line, message }) => ({ kind, line, message })),
  skipped: r.result.program.skippedLines,
});

// #147's steady table: `[define{setup}]`, `[call(p5.createCanvas)][num{500}][num{500}]` and
// `[call(p5.background)]`, the background card lit red: it takes a colour and has none. Buffer
// lines: 1 the entry's import, 3 the strip's `@table` tag, 4 to 6 the cards' lines.
const BACKGROUND_ERROR = { kind: "TypeError", line: 6, message: "background takes 1 value" };

describe("the steady table's run (#147)", () => {
  const run = endToEnd("snap-147-vision-20261103-015737");

  test("once settled, the only error is background's missing colour, and it skips only its line", () => {
    const settled = between(run, 3.8);
    expect(settled.length).toBeGreaterThan(30);
    for (const r of settled) {
      expect(r.replayed.output.skippedLines).toEqual([]);
      expect(summary(r)).toEqual({ errors: [BACKGROUND_ERROR], skipped: [6] });
    }
  });

  test("the error lights the [call(p5.background)] card, marker 1004", () => {
    for (const r of between(run, 3.8)) expect(markersOf(r.result.errors[0], r)).toEqual([1004]);
  });
});

describe("the steady table's lift run (#147)", () => {
  const run = endToEnd("snap-147-vision-20261103-012950");

  test("ends, the cards put back, on the same error and skip", () => {
    const last = run[run.length - 1];
    expect(summary(last)).toEqual({ errors: [BACKGROUND_ERROR], skipped: [6] });
    expect(markersOf(last.result.errors[0], last)).toEqual([1004]);
  });
});

// The walking skeleton's paper cards (#115), demo program 1's first block. With #147's join rules,
// `[call(p5.rect)]` keeps only `[get{x}]` (see rig.test.ts), so rect has 1 of its 4 values: the
// prototypes' `TypeError` on line 12, which skips only that line.
const RECT_ERROR = { kind: "TypeError", line: 12, message: "rect takes 4 values" };

describe("the walking skeleton's run (#115)", () => {
  const run = endToEnd("snap-115-vision-20261102-224407");

  test("ends on rect's missing values, lighting the [call(p5.rect)] card, marker 1017", () => {
    const last = run[run.length - 1];
    expect(summary(last)).toEqual({ errors: [RECT_ERROR], skipped: [12] });
    expect(markersOf(last.result.errors[0], last)).toEqual([1017]);
  });

  test("a line the camera hasn't read yet is skipped with no error, and a skipped [repeat] takes its body and [dedent]", () => {
    // From 2.7 s, `[call(p5.createCanvas)]`'s and `[repeat]`'s nums aren't read yet; from 3.0 s,
    // only `[repeat]`'s, until a blank comes in at 4.2 s.
    const [first, second] = [between(run, 2.7, 3.0), between(run, 3.0, 4.1)];
    expect(first.length).toBeGreaterThan(0);
    expect(second.length).toBeGreaterThan(0);
    for (const r of first) {
      expect(r.replayed.output.skippedLines.map((s) => s.line)).toEqual([5, 9]);
      expect(summary(r)).toEqual({ errors: [], skipped: [5, 9, 10, 11, 12, 13] });
    }
    for (const r of second) {
      expect(r.replayed.output.skippedLines).toEqual([{ line: 9, reason: "not read yet" }]);
      expect(summary(r)).toEqual({ errors: [], skipped: [9, 10, 11, 12, 13] });
    }
  });

  test("from the first full read on, rect's error always shows; any other is a blank [num{}], on its own card", () => {
    const held = between(run, 7.7);
    expect(held.length).toBeGreaterThan(100);
    let onlyRect = 0;
    for (const r of held) {
      const rect = r.result.errors.filter((e) => e.kind === "TypeError");
      expect(rect.map(({ kind, line, message }) => ({ kind, line, message }))).toEqual([RECT_ERROR]);
      expect(markersOf(rect[0], r)).toEqual([1017]);
      const others = r.result.errors.filter((e) => e !== rect[0]);
      if (others.length === 0) onlyRect += 1;
      // This run's vision service sent `blank` for a card not read yet at times. Blank goes in as `{}`
      // and the reader doesn't skip it, so `[num{}]` is a SyntaxError, which skips its line.
      for (const e of others) {
        expect(e.kind).toBe("SyntaxError");
        const [track] = tracksOf(e, r.replayed.output);
        expect(r.replayed.cards.find((c) => c.track === track)?.hw?.state).toBe("blank");
        expect(r.result.program.skippedLines).toContain(e.line);
      }
      expect(r.replayed.output.skippedLines).toEqual([]);
    }
    expect(onlyRect / held.length).toBeGreaterThan(0.8);
  });
});
