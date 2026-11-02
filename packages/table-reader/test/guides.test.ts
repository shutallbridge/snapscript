import { describe, expect, test } from "vitest";
import type { ReaderState } from "../src/index.ts";
import { at, card, code, ids, play, U } from "./fixtures.ts";

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

const setup = card(1, 1000, 60, 40, { text: "Setup" });
const draw = card(2, 1000, 60, 300, { text: "draw" });

describe("page guides", () => {
  test("fasten to the real strip that starts with the same card, its handwriting matched ignoring case", () => {
    const out = play(entry, [{ t: 0, cards: [setup] }], { page }).last;
    expect(out.virtualCards).toEqual([
      { id: "g1.2.1", kind: "guide", card: "[call(sketch.createCanvas)]", length: 4, ...at(60, 40 + U) },
      { id: "g1.2.2", kind: "guide", card: "[num{500}]", length: 4, ...at(60 + 4 * U, 40 + U) },
      { id: "g1.2.3", kind: "guide", card: "[num{500}]", length: 4, ...at(60 + 8 * U, 40 + U) },
    ]);
  });

  test("follow their real strip's turn", () => {
    const turned = card(1, 1000, 60, 40, { text: "setup", angle: 10 });
    const out = play(entry, [{ t: 0, cards: [turned] }], { page }).last;
    const r = (10 * Math.PI) / 180;
    expect(out.virtualCards[0].x).toBeCloseTo(at(60 - U * Math.sin(r), 40 + U * Math.cos(r), 10).x);
    expect(out.virtualCards[0].angle).toBe(10);
  });

  test("a strip head with other handwriting doesn't fasten them", () => {
    const other = card(1, 1000, 60, 40, { text: "setUp2" });
    expect(play(entry, [{ t: 0, cards: [other] }], { page }).last.virtualCards).toEqual([]);
  });

  test("an auto page strip with no matching real strip shows no guides (what auto does then is #157's)", () => {
    // The gap: auto placement isn't built, so the page's [define{draw}] strip is left out here.
    const out = play(entry, [{ t: 0, cards: [setup] }], { page }).last;
    expect(ids(out).filter((id) => id.startsWith("g2."))).toEqual([]);
    const both = play(entry, [{ t: 0, cards: [setup, draw] }], { page }).last;
    expect(ids(both).filter((id) => id.startsWith("g2."))).toEqual(["g2.2.1", "g2.2.2"]);
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
        { t: 0, cards: [setup, second(1024)] },
        { t: 0.5, cards: [setup, second(1024)] },
      ],
      { page },
    );
    expect(ids(r.outputs[0])).toEqual(["g1.2.1", "g1.2.2", "g1.2.3"]);
    expect(r.outputs[0].wakeAt).toBeCloseTo(0.4);
    expect(ids(r.last)).toEqual(["g1.2.1", "g1.2.3"]);
    expect(r.last.places).toEqual([{ track: 5, virtual: "g1.2.2" }]);
    expect(r.last.mismatches).toEqual([]);
  });

  test("another card in a guide's place is a mismatch, judged by marker: [color(gold)] on [num{500}]", () => {
    const r = play(
      entry,
      [
        { t: 0, cards: [setup, card(4, 1040, 60 + U * 0, 40 + U), second(1024), third(1040)] },
        { t: 1, cards: [setup, card(4, 1040, 60 + U * 0, 40 + U), second(1024), third(1040)] },
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
    const circle = card(7, 0, 60, 300 + U);
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
    const laid = [setup, second(1024)];
    const r = play(
      entry,
      [
        { t: 0, cards: laid },
        { t: 1, cards: laid },
        { t: 2, cards: [setup, second(1024, 14)] },
        { t: 3, cards: [setup, { ...second(1024, 14), angle: 19 }] },
        { t: 4, cards: [setup, second(1024, 16)] },
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
    const slide = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({ t: i * 0.1, cards: [setup, second(1024, i * 15 - 60)] }));
    const r = play(entry, slide, { page });
    expect(r.outputs.every((o) => o.places.length === 0)).toBe(true);
  });
});

describe("value guides", () => {
  // A stand-in [call(p5.circle)] (2U) at (50, 80), on line 3 of the buffer.
  const program = "/** @table 50 50 */\n[define{draw}]\n[call(p5.circle)]";
  const values = (prev: ReaderState) => ({
    values: [{ version: prev.version, at: { line: 3, start: 0 }, values: ["x", "y", "d"] }],
  });

  test("are placed after their call card from the expected values passed in", () => {
    const r = play(program, [{ t: 0, cards: [] }, { t: 1, cards: [] }], values);
    expect(r.last.virtualCards.filter((v) => v.kind === "value")).toEqual([
      { id: "v.s2.1", kind: "value", value: "x", length: 4, ...at(50 + 2 * U, 80) },
      { id: "v.s2.2", kind: "value", value: "y", length: 4, ...at(50 + 6 * U, 80) },
      { id: "v.s2.3", kind: "value", value: "d", length: 4, ...at(50 + 10 * U, 80) },
    ]);
  });

  test("from a buffer version that's gone are ignored", () => {
    const stale = () => ({ values: [{ version: 99, at: { line: 3, start: 0 }, values: ["x"] }] });
    const r = play(program, [{ t: 0, cards: [] }, { t: 1, cards: [] }], stale);
    expect(r.last.virtualCards.filter((v) => v.kind === "value")).toEqual([]);
  });

  test("never give a mismatch: any card in their place takes it", () => {
    const gold = card(8, 1040, 50 + 2 * U, 80);
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
    // ID 0 is the 3U [call(p5.circle)].
    const r = play(
      "/** @table hidden */\n[import(snapscript-p5)as(p5)]",
      [
        { t: 0, cards: [card(1, 1000, 50, 50, { text: "draw" }), card(3, 0, 50, 50 + U)] },
        { t: 1, cards: [card(1, 1000, 50, 50, { text: "draw" }), card(3, 0, 50, 50 + U)] },
      ],
      // The buffer: the import (lines 1–2), a blank line, the @table tag, [define{draw}], then the call.
      (prev) => ({ values: [{ version: prev.version, at: { line: 6, start: 0 }, values: ["x"] }] }),
    );
    expect(r.last.virtualCards).toEqual([{ id: "v.t3.1", kind: "value", value: "x", length: 4, ...at(50 + 3 * U, 80) }]);
  });
});
