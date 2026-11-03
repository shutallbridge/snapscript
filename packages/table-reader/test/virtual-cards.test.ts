import { describe, expect, test } from "vitest";
import { initialState, step, type StepOutput } from "../src/index.ts";
import {
  at,
  card,
  code,
  DEFINE,
  GOLD,
  ids,
  languageMarkers,
  layout,
  lockfile,
  NUM,
  play,
  SET,
  table,
  U,
} from "./fixtures.ts";

describe("text → cards: stand-ins", () => {
  test("each strip's cards lie at its @table position, at their shortest lengths", () => {
    const entry = [
      "/** @table 100 50 */",
      "[define{draw}]",
      "[call(p5.createCanvas)][num{500}][color(gold)]",
      "[repeat][call(p5.circle)][call(p5.background)]",
      "  [setProp{x}to][+]",
    ].join("\n");
    const out = step(initialState(entry), { table: table(), layout, lockfile, languageMarkers }).output;
    expect(out.virtualCards).toEqual([
      // [define{…}] is 5U, other handwritten cards 4U and color cards 4U (#101).
      { id: "s1", kind: "stand-in", card: "[define{draw}]", length: 5, ...at(100, 50) },
      // createCanvas is 12 letters: 4U holds 17.
      { id: "s2", kind: "stand-in", card: "[call(p5.createCanvas)]", length: 4, ...at(100, 80) },
      { id: "s3", kind: "stand-in", card: "[num{500}]", length: 4, ...at(100 + 4 * U, 80) },
      { id: "s4", kind: "stand-in", card: "[color(gold)]", length: 4, ...at(100 + 8 * U, 80) },
      // repeat and circle are 6 letters: 2U holds 6. background is 10: 3U holds 11.
      { id: "s5", kind: "stand-in", card: "[repeat]", length: 2, ...at(100, 110) },
      { id: "s6", kind: "stand-in", card: "[call(p5.circle)]", length: 2, ...at(100 + 2 * U, 110) },
      { id: "s7", kind: "stand-in", card: "[call(p5.background)]", length: 3, ...at(100 + 4 * U, 110) },
      // An indent of two spaces is 1U across. [setProp{…}to] is 5U, and no card is under 2U.
      { id: "s8", kind: "stand-in", card: "[setProp{x}to]", length: 5, ...at(100 + U, 140) },
      { id: "s9", kind: "stand-in", card: "[+]", length: 2, ...at(100 + 6 * U, 140) },
    ]);
  });

  test("stand-ins count in the buffer like real cards, tied to their spans", () => {
    const out = play("/** @table 50 50 */\n[define{draw}]\n[set{x}to][num{1}]", [{ t: 0, cards: [] }]).last;
    expect(code(out.text)).toBe("[define{draw}]\n[set{x}to][num{1}]");
    expect(out.map.cards).toEqual([
      { standIn: "s1", span: { line: 2, start: 0, end: 14 } },
      { standIn: "s2", span: { line: 3, start: 0, end: 10 } },
      { standIn: "s3", span: { line: 3, start: 10, end: 18 } },
    ]);
    expect(out.map.lines).toEqual([
      { line: 2, tracks: [], standIns: ["s1"] },
      { line: 3, tracks: [], standIns: ["s2", "s3"] },
    ]);
  });

  test("a turned strip lies along its turn, about its first card's top-left corner", () => {
    const out = play("/** @table 40 210 15 */\n[define{draw}]\n[call(p5.circle)][num{5}]", [{ t: 0, cards: [] }]).last;
    const r = (15 * Math.PI) / 180;
    const corner = (along: number, down: number) =>
      at(40 + along * Math.cos(r) - down * Math.sin(r), 210 + along * Math.sin(r) + down * Math.cos(r), 15);
    const expected = [corner(0, 0), corner(0, U), corner(2 * U, U)];
    expect(out.virtualCards).toHaveLength(3);
    out.virtualCards.forEach((v, i) => {
      expect(v.x).toBeCloseTo(expected[i].x);
      expect(v.y).toBeCloseTo(expected[i].y);
      expect(v.angle).toBe(15);
    });
    expect(out.text).toBe("/** @table 40 210 15 */\n[define{draw}]\n[call(p5.circle)][num{5}]");
  });

  test("a head's doc comment stays with its strip, and every other comment is dropped", () => {
    const entry = [
      "// the setup strip",
      "/**",
      " * Runs once.",
      " * @table 50 50",
      " */",
      "[define{setup}]",
      "// a size",
      "[set{x}to][num{1}] // one",
    ].join("\n");
    expect(play(entry, [{ t: 0, cards: [] }]).last.text).toBe(
      "/**\n * Runs once.\n * @table 50 50 0\n */\n[define{setup}]\n[set{x}to][num{1}]",
    );
  });

  test("a hidden strip is kept as written and shows no stand-ins", () => {
    const entry = "/** @table hidden */\n[define{helper}]\n[return][num{1}]";
    const out = play(entry, [{ t: 0, cards: [] }]).last;
    expect(out.text).toBe(entry);
    expect(out.virtualCards).toEqual([]);
  });
});

describe("text → cards: @table auto", () => {
  // Strips with no tag, `@table auto` or a tag the system can't read, in file order.
  const strips = [
    "[define{setup}]\n[call(p5.createCanvas)][num{500}][num{500}]",
    "/** @table auto */\n[define{draw}]\n[call(p5.circle)][num{1}]",
    "/** @table here */\n[define{other}]",
  ];
  const heads = (out: StepOutput) =>
    out.virtualCards.filter((v) => v.kind === "stand-in" && v.card.startsWith("[define"));

  test("stack down the left of the coding space: the first 4U from its top and left, each next 2U below the last", () => {
    const out = play(strips.join("\n\n"), [{ t: 0, cards: [] }]).last;
    expect(out.virtualCards).toEqual([
      { id: "s1", kind: "stand-in", card: "[define{setup}]", length: 5, ...at(4 * U, 4 * U) },
      { id: "s2", kind: "stand-in", card: "[call(p5.createCanvas)]", length: 4, ...at(4 * U, 5 * U) },
      { id: "s3", kind: "stand-in", card: "[num{500}]", length: 4, ...at(8 * U, 5 * U) },
      { id: "s4", kind: "stand-in", card: "[num{500}]", length: 4, ...at(12 * U, 5 * U) },
      // The first strip is 2U tall, so the next starts 2U below its bottom: 8U down.
      { id: "s5", kind: "stand-in", card: "[define{draw}]", length: 5, ...at(4 * U, 8 * U) },
      { id: "s6", kind: "stand-in", card: "[call(p5.circle)]", length: 2, ...at(4 * U, 9 * U) },
      { id: "s7", kind: "stand-in", card: "[num{1}]", length: 4, ...at(6 * U, 9 * U) },
      { id: "s8", kind: "stand-in", card: "[define{other}]", length: 5, ...at(4 * U, 12 * U) },
    ]);
  });

  test("the buffer writes each where it lies, its doc comment kept", () => {
    const out = play(strips.join("\n\n"), [{ t: 0, cards: [] }]).last;
    expect(out.text).toBe(
      [
        "/** @table 120 120 0 */",
        "[define{setup}]",
        "[call(p5.createCanvas)][num{500}][num{500}]",
        "",
        "/** @table 120 240 0 */",
        "[define{draw}]",
        "[call(p5.circle)][num{1}]",
        "",
        "/** @table 120 360 0 */",
        "[define{other}]",
      ].join("\n"),
    );
  });

  test("lay out the same every time, and a strip added at the end moves none of the others", () => {
    const once = heads(play(strips.join("\n\n"), [{ t: 0, cards: [] }]).last);
    const again = heads(play(strips.join("\n\n"), [{ t: 0, cards: [] }]).last);
    const more = heads(play([...strips, "[define{last}]"].join("\n\n"), [{ t: 0, cards: [] }]).last);
    expect(again).toEqual(once);
    expect(more.slice(0, 3)).toEqual(once);
    expect(more[3]).toMatchObject({ card: "[define{last}]", ...at(4 * U, 15 * U) });
  });

  test("leave out hidden strips and strips with a position, and ignore real cards", () => {
    const entry = [
      "/** @table hidden */\n[define{helper}]",
      strips[0],
      "/** @table 250 400 */\n[define{placed}]",
      strips[1],
    ].join("\n\n");
    // A loose real card lies just under the first auto strip's spot.
    const loose = card(9, NUM, 4 * U, 4 * U + 40, { text: "3" });
    const out = play(entry, [
      { t: 0, cards: [loose] },
      { t: 1, cards: [loose] },
    ]).last;
    expect(heads(out)).toEqual([
      expect.objectContaining({ card: "[define{setup}]", ...at(4 * U, 4 * U) }),
      expect.objectContaining({ card: "[define{placed}]", ...at(250, 400) }),
      expect.objectContaining({ card: "[define{draw}]", ...at(4 * U, 8 * U) }),
    ]);
  });

  test("a column that runs out of room starts the next 2U right of its widest strip", () => {
    // Four 2U-tall strips fill the 600 mm coding space's first column at 4U, 8U, 12U and 16U down;
    // a fifth would end at 22U (660 mm). The second strip is the widest, at 6U.
    const entry = [
      "[define{a}]\n[repeat]",
      "[define{b}]\n[repeat][repeat][repeat]",
      "[define{c}]\n[repeat]",
      "[define{d}]\n[repeat]",
      "[define{e}]\n[repeat]",
      "[define{f}]\n[repeat]",
    ].join("\n\n");
    const out = heads(play(entry, [{ t: 0, cards: [] }]).last);
    expect(out.map(({ x, y }) => ({ x, y }))).toEqual([
      at(4 * U, 4 * U),
      at(4 * U, 8 * U),
      at(4 * U, 12 * U),
      at(4 * U, 16 * U),
      at(12 * U, 4 * U),
      at(12 * U, 8 * U),
    ].map(({ x, y }) => ({ x, y })));
  });
});

describe("places on stand-ins", () => {
  const entry = "/** @table 50 50 */\n[define{draw}]\n[set{x}to][num{1}]";
  // A real [num{…}] laid on the stand-in [num{1}]'s spot, off by (dx, dy) mm.
  const num = (dx = 0, dy = 0) => card(9, NUM, 50 + 4 * U + dx, 50 + U + dy, { text: "7" });

  test("a card lying still about 0.4 s within 10 mm takes the stand-in's place, and replaces it", () => {
    const r = play(entry, [
      { t: 0, cards: [num(6, 6)] },
      { t: 0.3, cards: [num(6, 6)] },
      { t: 0.4, cards: [num(6, 6)] },
    ]);
    expect(r.outputs.map(ids)).toEqual([
      ["s1", "s2", "s3"],
      ["s1", "s2", "s3"],
      ["s1", "s2"],
    ]);
    // The table app is told when to step again.
    expect(r.outputs[0].wakeAt).toBeCloseTo(0.4);
    expect(code(r.last.text)).toBe("[define{draw}]\n[set{x}to][num{7}]");
    expect(r.last.map.lines[1]).toEqual({ line: 3, tracks: [9], standIns: ["s2"] });
    expect(r.last.wakeAt).toBeUndefined();
  });

  test("a card further than 10 mm, or turned more than 15°, takes no place", () => {
    const far = play(entry, [{ t: 0, cards: [num(8, 7)] }, { t: 1, cards: [num(8, 7)] }]).last;
    expect(ids(far)).toEqual(["s1", "s2", "s3"]);
    const turned = { ...num(), angle: 16 };
    expect(ids(play(entry, [{ t: 0, cards: [turned] }, { t: 1, cards: [turned] }]).last)).toEqual(["s1", "s2", "s3"]);
  });

  test("a card slid across a row of stand-ins takes nothing on its way", () => {
    const row = "/** @table 50 50 */\n[define{draw}]\n[set{x}to][num{1}][num{2}][num{3}]";
    const slide = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => ({
      t: i * 0.1,
      cards: [card(9, NUM, 50 + 4 * U + i * 15, 50 + U, { text: "7" })],
    }));
    const away = card(9, NUM, 50 + 4 * U + 135, 50 + U + 60, { text: "7" });
    const r = play(row, [...slide, { t: 2, cards: [away] }]);
    expect(ids(r.last)).toEqual(["s1", "s2", "s3", "s4", "s5"]);
  });

  test("a replaced stand-in is gone for good: lifting the card doesn't bring it back", () => {
    const r = play(entry, [
      { t: 0, cards: [num()] },
      { t: 1, cards: [num()] },
      { t: 2, cards: [] },
    ]);
    expect(ids(r.last)).toEqual(["s1", "s2"]);
    expect(code(r.last.text)).toBe("[define{draw}]\n[set{x}to]");
  });

  test("stand-ins join lines like real cards: a real card laid right of a stand-in line joins it", () => {
    const r = play(entry, [{ t: 0, cards: [card(9, NUM, 50 + 8 * U + 3, 50 + U + 2, { text: "5" })] }]);
    expect(code(r.last.text)).toBe("[define{draw}]\n[set{x}to][num{1}][num{5}]");
    expect(r.last.map.lines[1]).toEqual({ line: 3, tracks: [9], standIns: ["s2", "s3"] });
  });

  test("a real line laid under a stand-in strip head is a line of its strip", () => {
    const r = play("/** @table 50 50 */\n[define{draw}]", [{ t: 0, cards: [card(9, SET, 52, 50 + U, { text: "y" })] }]);
    expect(code(r.last.text)).toBe("[define{draw}]\n[set{y}to]");
  });

  test("a real head that replaces a stand-in head keeps its strip's place and doc comment", () => {
    const two = "/**\n * Runs once.\n * @table 50 50\n */\n[define{setup}]\n\n/** @table 50 300 */\n[define{draw}]";
    const head = card(9, DEFINE, 52, 51, { text: "setup" });
    const r = play(two, [
      { t: 0, cards: [head] },
      { t: 1, cards: [head] },
    ]);
    expect(r.last.text).toBe(
      "/**\n * Runs once.\n * @table 52 51 0\n */\n[define{setup}]\n\n/** @table 50 300 0 */\n[define{draw}]",
    );
    expect(r.last.stripHeads).toEqual([9]);
    expect(ids(r.last)).toEqual(["s2"]);
  });

  test("any card replaces a stand-in, as an edit, and gives no mismatch", () => {
    const gold = card(9, GOLD, 50 + 4 * U, 50 + U);
    const r = play(entry, [
      { t: 0, cards: [gold] },
      { t: 1, cards: [gold] },
    ]);
    expect(code(r.last.text)).toBe("[define{draw}]\n[set{x}to][color(gold)]");
    expect(r.last.mismatches).toEqual([]);
  });
});
