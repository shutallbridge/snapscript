import { describe, expect, test } from "vitest";
import type { ReaderState, StepOutput } from "../src/index.ts";
import { at, card, CIRCLE, code, DEFINE, GOLD, ids, NUM, play, SETUP, U } from "./fixtures.ts";

// The project imports snapscript-p5 as p5, and the page as sketch: guides match by marker, so the
// names needn't agree.
const entry = "/** @table hidden */\n[import(snapscript-p5)as(p5)]";
const page = [
  "/** @table hidden */",
  "[import(snapscript-p5)as(sketch)]",
  "",
  "[define{setup}]",
  "[call(sketch.createCanvas)][num{500}][num{500}]",
  "",
  "[define{draw}]",
  "[call(sketch.circle)][num{250}]",
].join("\n");

const setup = card(1, DEFINE, 60, 40, { text: "Setup" });
const draw = card(2, DEFINE, 60, 300, { text: "draw" });

describe("page guides", () => {
  test("fasten to the real strip that starts with the same card, its handwriting matched ignoring case", () => {
    const out = play(entry, [{ t: 0, cards: [setup] }], { page }).last;
    expect(out.virtualCards.filter((v) => v.id.startsWith("g1."))).toEqual([
      { id: "g1.2.1", kind: "guide", card: "[call(sketch.createCanvas)]", length: 4, ...at(60, 40 + U) },
      { id: "g1.2.2", kind: "guide", card: "[num{500}]", length: 4, ...at(60 + 4 * U, 40 + U) },
      { id: "g1.2.3", kind: "guide", card: "[num{500}]", length: 4, ...at(60 + 8 * U, 40 + U) },
    ]);
  });

  test("follow their real strip's turn", () => {
    const turned = card(1, DEFINE, 60, 40, { text: "setup", angle: 10 });
    const out = play(entry, [{ t: 0, cards: [turned] }], { page }).last;
    const r = (10 * Math.PI) / 180;
    expect(out.virtualCards[0].x).toBeCloseTo(at(60 - U * Math.sin(r), 40 + U * Math.cos(r), 10).x);
    expect(out.virtualCards[0].angle).toBe(10);
  });

  test("a strip head with other handwriting doesn't fasten them: the page strip lies where auto lays it", () => {
    const other = card(1, DEFINE, 60, 40, { text: "setUp2" });
    const out = play(entry, [{ t: 0, cards: [other] }], { page }).last;
    expect(out.virtualCards.filter((v) => v.id.startsWith("g1."))[0]).toEqual({
      id: "g1.1.1",
      kind: "guide",
      card: "[define{setup}]",
      length: 5,
      ...at(4 * U, 4 * U),
    });
  });

  test("with no matching real strip, page strips stack where auto lays them, heads and all", () => {
    const out = play(entry, [{ t: 0, cards: [] }], { page }).last;
    expect(out.virtualCards).toEqual([
      { id: "g1.1.1", kind: "guide", card: "[define{setup}]", length: 5, ...at(4 * U, 4 * U) },
      { id: "g1.2.1", kind: "guide", card: "[call(sketch.createCanvas)]", length: 4, ...at(4 * U, 5 * U) },
      { id: "g1.2.2", kind: "guide", card: "[num{500}]", length: 4, ...at(8 * U, 5 * U) },
      { id: "g1.2.3", kind: "guide", card: "[num{500}]", length: 4, ...at(12 * U, 5 * U) },
      // The setup strip is 2U tall: the draw strip starts 2U below it.
      { id: "g2.1.1", kind: "guide", card: "[define{draw}]", length: 5, ...at(4 * U, 8 * U) },
      { id: "g2.2.1", kind: "guide", card: "[call(sketch.circle)]", length: 2, ...at(4 * U, 9 * U) },
      { id: "g2.2.2", kind: "guide", card: "[num{250}]", length: 4, ...at(6 * U, 9 * U) },
    ]);
  });

  test("a fastened strip keeps its place in the stack: the next unfastened one doesn't move up", () => {
    const out = play(entry, [{ t: 0, cards: [setup] }], { page }).last;
    expect(out.virtualCards.filter((v) => v.id.startsWith("g2."))[0]).toMatchObject({ id: "g2.1.1", ...at(4 * U, 8 * U) });
    const both = play(entry, [{ t: 0, cards: [setup, draw] }], { page }).last;
    expect(ids(both).filter((id) => id.startsWith("g2."))).toEqual(["g2.2.1", "g2.2.2"]);
  });

  test("with two matching real strips, they fasten to the first in strip order", () => {
    // The lower strip was laid first, so it comes first in strip order though it lies lower.
    const lower = card(1, DEFINE, 60, 300, { text: "setup" });
    const upper = card(3, DEFINE, 60, 40, { text: "SETUP" });
    const r = play(
      entry,
      [
        { t: 0, cards: [lower] },
        { t: 1, cards: [lower, upper] },
      ],
      { page },
    );
    expect(r.last.stripHeads).toEqual([1, 3]);
    expect(r.last.virtualCards.find((v) => v.id === "g1.2.1")).toMatchObject(at(60, 300 + U));
  });

  test("a printed head fastens by its marker", () => {
    const printed = [
      "/** @table hidden */",
      "[import(snapscript-p5)as(sketch)]",
      "",
      "[define(setup)]",
      "[call(sketch.createCanvas)][num{500}][num{500}]",
    ].join("\n");
    const out = play(entry, [{ t: 0, cards: [card(1, SETUP, 60, 40)] }], { page: printed }).last;
    expect(ids(out)).toEqual(["g1.2.1", "g1.2.2", "g1.2.3"]);
    expect(out.virtualCards[0]).toMatchObject(at(60, 40 + U));
    // A handwritten [define{setup}] is another card: the page strip stays where auto lays it.
    const handwritten = play(entry, [{ t: 0, cards: [setup] }], { page: printed }).last;
    expect(handwritten.virtualCards[0]).toMatchObject({ id: "g1.1.1", ...at(4 * U, 4 * U) });
  });

  test("are never part of the program", () => {
    expect(play(entry, [{ t: 0, cards: [setup] }], { page }).last.text).toBe(
      `${entry}\n\n/** @table 60 40 0 */\n[define{Setup}]`,
    );
  });
});

describe("places and mismatches on guides", () => {
  // Real cards laid in the setup strip's guides' places: the second and third, after createCanvas.
  const second = (marker: number, dx = 0, text = "300") => card(5, marker, 60 + 4 * U + dx, 40 + U, { text });
  const third = (marker: number) => card(6, marker, 60 + 8 * U, 40 + U, { text: "1" });

  test("the right card in a guide's place replaces it, whatever its handwriting: [num{300}] on [num{500}]", () => {
    const r = play(
      entry,
      [
        { t: 0, cards: [setup, second(NUM)] },
        { t: 0.5, cards: [setup, second(NUM)] },
      ],
      { page },
    );
    const setupGuides = (out: StepOutput) => ids(out).filter((id) => id.startsWith("g1."));
    expect(setupGuides(r.outputs[0])).toEqual(["g1.2.1", "g1.2.2", "g1.2.3"]);
    expect(r.outputs[0].wakeAt).toBeCloseTo(0.4);
    expect(setupGuides(r.last)).toEqual(["g1.2.1", "g1.2.3"]);
    expect(r.last.places).toEqual([{ track: 5, virtual: "g1.2.2" }]);
    expect(r.last.mismatches).toEqual([]);
  });

  test("another card in a guide's place is a mismatch, judged by marker: [color(gold)] on [num{500}]", () => {
    const r = play(
      entry,
      [
        { t: 0, cards: [setup, card(4, GOLD, 60 + U * 0, 40 + U), second(NUM), third(GOLD)] },
        { t: 1, cards: [setup, card(4, GOLD, 60 + U * 0, 40 + U), second(NUM), third(GOLD)] },
      ],
      { page },
    );
    expect(r.last.places).toEqual([
      { track: 4, virtual: "g1.2.1" },
      { track: 5, virtual: "g1.2.2" },
      { track: 6, virtual: "g1.2.3" },
    ]);
    expect(r.last.mismatches).toEqual([
      { track: 4, virtual: "g1.2.1", card: "[call(sketch.createCanvas)]" },
      { track: 6, virtual: "g1.2.3", card: "[num{500}]" },
    ]);
    // A mismatched card still counts and runs.
    expect(code(r.last.text)).toContain("[color(gold)]");
  });

  test("a library card is the right card whatever name the page imports its library as", () => {
    const circle = card(7, CIRCLE, 60, 300 + U);
    const r = play(
      entry,
      [
        { t: 0, cards: [draw, circle] },
        { t: 1, cards: [draw, circle] },
      ],
      { page },
    );
    expect(r.last.places).toContainEqual({ track: 7, virtual: "g2.2.1" });
    expect(r.last.mismatches).toEqual([]);
  });

  test("a card keeps a guide's place until it moves past 15 mm or 20°", () => {
    const laid = [setup, second(NUM)];
    const r = play(
      entry,
      [
        { t: 0, cards: laid },
        { t: 1, cards: laid },
        { t: 2, cards: [setup, second(NUM, 14)] },
        { t: 3, cards: [setup, { ...second(NUM, 14), angle: 19 }] },
        { t: 4, cards: [setup, second(NUM, 16)] },
      ],
      { page },
    );
    expect(r.outputs.map((o) => o.places)).toEqual([
      [],
      [{ track: 5, virtual: "g1.2.2" }],
      [{ track: 5, virtual: "g1.2.2" }],
      [{ track: 5, virtual: "g1.2.2" }],
      [],
    ]);
    expect(ids(r.last)).toContain("g1.2.2");
  });

  test("a card slid across a row of guides takes none of their places", () => {
    const slide = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ t: i * 0.1, cards: [setup, second(NUM, i * 15 - 60)] }));
    const r = play(entry, slide, { page });
    expect(r.outputs.every((o) => o.places.length === 0)).toBe(true);
  });
});

describe("value guides", () => {
  // A stand-in [call(p5.circle)] (2U) at (50, 80), on line 3 of the buffer.
  const program = "/** @table 50 50 */\n[define{draw}]\n[call(p5.circle)]";
  const values = (prev: ReaderState) => ({
    values: [
      {
        version: prev.version,
        at: { line: 3, start: 0 },
        values: [
          { name: "x", type: "num" },
          { name: "c", type: "color" },
          { name: "d", type: null },
        ],
      },
    ],
  });

  test("are placed after their call card from the expected values passed in, each with its declared type", () => {
    const r = play(program, [{ t: 0, cards: [] }, { t: 1, cards: [] }], values);
    expect(r.last.virtualCards.filter((v) => v.kind === "value")).toEqual([
      { id: "v.s2.1", kind: "value", value: "x", type: "num", length: 4, ...at(50 + 2 * U, 80) },
      { id: "v.s2.2", kind: "value", value: "c", type: "color", length: 4, ...at(50 + 6 * U, 80) },
      // A value with no declared type has none: a plain guide.
      { id: "v.s2.3", kind: "value", value: "d", type: null, length: 4, ...at(50 + 10 * U, 80) },
    ]);
  });

  test("from a buffer version that's gone are ignored", () => {
    const stale = () => ({ values: [{ version: 99, at: { line: 3, start: 0 }, values: [{ name: "x", type: "num" }] }] });
    const r = play(program, [{ t: 0, cards: [] }, { t: 1, cards: [] }], stale);
    expect(r.last.virtualCards.filter((v) => v.kind === "value")).toEqual([]);
  });

  test("never give a mismatch: any card in their place takes it", () => {
    const gold = card(8, GOLD, 50 + 2 * U, 80);
    const r = play(
      program,
      [
        { t: 0, cards: [gold] },
        { t: 1, cards: [gold] },
      ],
      values,
    );
    expect(r.last.places).toEqual([{ track: 8, virtual: "v.s2.1" }]);
    expect(r.last.mismatches).toEqual([]);
    expect(r.last.virtualCards.filter((v) => v.kind === "value").map((v) => v.id)).toEqual(["v.s2.2", "v.s2.3"]);
  });

  test("follow a real call card", () => {
    // CIRCLE is the 3U [call(p5.circle)].
    const r = play(
      "/** @table hidden */\n[import(snapscript-p5)as(p5)]",
      [
        { t: 0, cards: [card(1, DEFINE, 50, 50, { text: "draw" }), card(3, CIRCLE, 50, 50 + U)] },
        { t: 1, cards: [card(1, DEFINE, 50, 50, { text: "draw" }), card(3, CIRCLE, 50, 50 + U)] },
      ],
      // The buffer: the import (lines 1–2), a blank line, the @table tag, [define{draw}], then the call.
      (prev) => ({ values: [{ version: prev.version, at: { line: 6, start: 0 }, values: [{ name: "x", type: "num" }] }] }),
    );
    expect(r.last.virtualCards).toEqual([
      { id: "v.t3.1", kind: "value", value: "x", type: "num", length: 4, ...at(50 + 3 * U, 80) },
    ]);
  });
});
