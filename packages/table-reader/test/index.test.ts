import { describe, expect, test } from "vitest";
import { defaultSettings, initialState, step } from "../src/index.ts";
import { card, code, languageMarkers, layout, lockfile, run, table, textOf, U } from "./fixtures.ts";

describe("strips", () => {
  test("a [define{…}] on its own is a strip of one line", () => {
    expect(textOf(table(card(1, 1000, 50, 50, { text: "setup" })))).toBe("[define{setup}]");
  });
});

// [define{setup}] at (50, 50), [set{x}to] (4U) right under it, and [num{…}] beside that, `along` mm
// past its end and `across` mm down, turned `angle` degrees about its marker.
const head = card(1, 1000, 50, 50, { text: "setup" });
const set = card(2, 1011, 50, 50 + U, { text: "x" });
const num = (along: number, across: number, angle = 0) => {
  // Measured along the line the two cards' angles average to.
  const r = (angle / 2) * (Math.PI / 180);
  const reach = 4 * U + along;
  return {
    ...card(3, 1024, 50, 50 + U, { text: "250" }),
    x: set.x + reach * Math.cos(r) - across * Math.sin(r),
    y: set.y + reach * Math.sin(r) + across * Math.cos(r),
    angle,
  };
};

describe("joins", () => {
  test("a line under a strip head joins its strip", () => {
    expect(textOf(table(head, set))).toBe("[define{setup}]\n[set{x}to]");
  });

  test("two cards 3 mm apart along and 5 mm out of line join", () => {
    expect(textOf(table(head, set, num(3, 5)))).toBe("[define{setup}]\n[set{x}to][num{250}]");
  });

  test("two cards 11 mm apart along don't join", () => {
    expect(textOf(table(head, set, num(11, 0)))).toBe("[define{setup}]\n[set{x}to]");
  });

  test("two cards 7 mm out of line don't join", () => {
    expect(textOf(table(head, set, num(0, 7)))).toBe("[define{setup}]\n[set{x}to]");
  });

  test("a card overlapping by up to 8 mm joins, and by more doesn't", () => {
    expect(textOf(table(head, set, num(-8, 0)))).toBe("[define{setup}]\n[set{x}to][num{250}]");
    expect(textOf(table(head, set, num(-9, 0)))).toBe("[define{setup}]\n[set{x}to]");
  });

  test("a made join holds at 14 mm along and breaks past 15 mm", () => {
    const joined = "[define{setup}]\n[set{x}to][num{250}]";
    const split = "[define{setup}]\n[set{x}to]";
    const held = run(table(head, set, num(0, 0)), table(head, set, num(14, 0)));
    expect(held.outputs.map((o) => code(o.text))).toEqual([joined, joined]);
    const broken = run(table(head, set, num(0, 0)), table(head, set, num(14, 0)), table(head, set, num(15.5, 0)));
    expect(code(broken.last.text)).toBe(split);
  });

  test("a made join holds 8 mm sideways and breaks past 9 mm", () => {
    const joined = "[define{setup}]\n[set{x}to][num{250}]";
    expect(code(run(table(head, set, num(0, 0)), table(head, set, num(0, 8))).last.text)).toBe(joined);
    expect(code(run(table(head, set, num(0, 0)), table(head, set, num(0, 9.5))).last.text)).toBe(
      "[define{setup}]\n[set{x}to]",
    );
  });

  test("a broken join must be made again from scratch", () => {
    const r = run(table(head, set, num(0, 0)), table(head, set, num(16, 0)), table(head, set, num(14, 0)));
    expect(code(r.last.text)).toBe("[define{setup}]\n[set{x}to]");
  });

  test("cards more than 15° apart in angle don't join, and 14° apart do", () => {
    expect(textOf(table(head, set, num(2, 0, 16)))).toBe("[define{setup}]\n[set{x}to]");
    expect(textOf(table(head, set, num(2, 0, 14)))).toBe("[define{setup}]\n[set{x}to][num{250}]");
  });

  test("a whole strip turned 30° still reads, measured along its own line", () => {
    const a = 30;
    const at = (along: number, down: number): [number, number] => {
      const r = (a * Math.PI) / 180;
      return [50 + along * Math.cos(r) - down * Math.sin(r), 50 + along * Math.sin(r) + down * Math.cos(r)];
    };
    const r = run(
      table(
        card(1, 1000, ...at(0, 0), { angle: a, text: "setup" }),
        card(2, 1011, ...at(0, U), { angle: a, text: "x" }),
        card(3, 1024, ...at(4 * U + 3, U + 5), { angle: a, text: "250" }),
      ),
    );
    expect(code(r.last.text)).toBe("[define{setup}]\n[set{x}to][num{250}]");
  });
});

describe("line to line", () => {
  // [define{draw}] / [repeat][num{3}] / indented [set{x}to][num{1}] / [dedent], laid on a 1U grid.
  const lines = (indentShift = 0, dedentShift = 0) =>
    table(
      card(1, 1000, 50, 50, { text: "draw" }),
      card(2, 1009, 50, 50 + U),
      card(3, 1024, 50 + 2 * U, 50 + U, { text: "3" }),
      card(4, 1011, 50 + U + indentShift, 50 + 2 * U, { text: "x" }),
      card(5, 1025, 50 + 5 * U + indentShift, 50 + 2 * U, { text: "1" }),
      card(6, 1022, 50 + dedentShift, 50 + 3 * U),
    );

  test("line heads at +1U and −1U across read as an indent and a dedent", () => {
    expect(textOf(lines())).toBe("[define{draw}]\n[repeat][num{3}]\n  [set{x}to][num{1}]\n[dedent]");
  });

  test("a line head is linked within 10 mm of its spot, and not past it", () => {
    expect(textOf(lines(9))).toBe("[define{draw}]\n[repeat][num{3}]\n  [set{x}to][num{1}]\n[dedent]");
    expect(textOf(lines(11))).toBe("[define{draw}]\n[repeat][num{3}]");
  });

  test("a made link is kept up to 15 mm, and lost past it", () => {
    const full = "[define{draw}]\n[repeat][num{3}]\n  [set{x}to][num{1}]\n[dedent]";
    expect(code(run(lines(0), lines(14)).last.text)).toBe(full);
    expect(code(run(lines(0), lines(14), lines(16)).last.text)).toBe("[define{draw}]\n[repeat][num{3}]");
  });

  test("a line under a dedented line keeps counting columns from the strip head", () => {
    const t = table(
      card(1, 1000, 50, 50, { text: "draw" }),
      card(2, 1009, 50, 50 + U),
      card(3, 1032, 50 + U, 50 + 2 * U),
      card(4, 1011, 50 + 2 * U, 50 + 3 * U, { text: "x" }),
      card(5, 1022, 50 + U, 50 + 4 * U),
      card(6, 1022, 50, 50 + 5 * U),
    );
    expect(textOf(t)).toBe("[define{draw}]\n[repeat]\n  [if]\n    [set{x}to]\n  [dedent]\n[dedent]");
  });

  test("a line head 2U across isn't linked", () => {
    const t = table(card(1, 1000, 50, 50, { text: "draw" }), card(2, 1011, 50 + 2 * U, 50 + U, { text: "x" }));
    expect(textOf(t)).toBe("[define{draw}]");
  });
});

describe("cards that stand alone", () => {
  test.each([
    ["[define{…}]", 1000, "[define{f}]"],
    ["[on(…)]", 1030, "[on(load)]"],
    ["[global{…}]", 1031, "[global{f}]"],
  ])("%s right under a line starts its own strip", (_, marker, written) => {
    const t = table(
      card(1, 1000, 50, 50, { text: "setup" }),
      card(2, 1011, 50, 50 + U, { text: "x" }),
      card(3, marker, 50, 50 + 2 * U, { text: "f" }),
      card(4, 1018, 50, 50 + 3 * U, { text: "y" }),
    );
    expect(textOf(t)).toBe(`[define{setup}]\n[set{x}to]\n\n${written}\n[get{y}]`);
  });

  test("a [define{…}] butted against a line's end doesn't join it", () => {
    const t = table(
      card(1, 1000, 50, 50, { text: "setup" }),
      card(2, 1011, 50, 50 + U, { text: "x" }),
      card(3, 1000, 50 + 4 * U, 50 + U, { text: "f" }),
    );
    expect(textOf(t)).toBe("[define{setup}]\n[set{x}to]\n\n[define{f}]");
  });
});

describe("windows and corners", () => {
  test("a card whose marker is in the canvas space is ignored, even if its card reaches back", () => {
    // The [num{1}] butts against [set{x}to] but starts 5 mm left of the split at 400 mm, so its
    // marker lies in the canvas space.
    const t = table(card(1, 1000, 280, 50, { text: "setup" }), card(2, 1011, 280, 50 + U, { text: "x" }), card(3, 1024, 395, 50 + U, { text: "1" }));
    expect(textOf(t)).toBe("[define{setup}]\n[set{x}to]");
  });

  test("a strip head in the canvas space reads nothing", () => {
    expect(textOf(table(card(1, 1000, 450, 50, { text: "setup" })))).toBe("");
  });

  test("a card in a corner is ignored", () => {
    // The help corner is the 100 mm quarter circle about the table's bottom-left corner (0, 600).
    const t = table(card(1, 1000, 10, 530, { text: "setup" }), card(2, 1000, 10, 50, { text: "draw" }));
    expect(textOf(t)).toBe("[define{draw}]");
  });

  test("markers that are pages make no cards", () => {
    const t = table(card(1, 1000, 50, 50, { text: "setup" }), card(2, 1900, 50, 50 + U));
    expect(textOf(t)).toBe("[define{setup}]");
  });
});

describe("library cards", () => {
  test("take their length from the lockfile", () => {
    // ID 0 is the 3U [call(p5.circle)]: a [num{…}] 3U along joins it, and one 4U along doesn't.
    const line = (along: number) =>
      table(card(1, 1000, 50, 50, { text: "draw" }), card(2, 0, 50, 50 + U), card(3, 1024, 50 + along, 50 + U, { text: "5" }));
    expect(run(line(3 * U)).last.map.lines[1].tracks).toEqual([2, 3]);
    expect(run(line(4 * U)).last.map.lines[1].tracks).toEqual([2]);
  });
});

describe("the card-to-text map", () => {
  const t = table(
    card(1, 1000, 50, 50, { text: "draw" }),
    card(2, 1009, 50, 50 + U),
    card(3, 1024, 50 + 2 * U, 50 + U, { text: "3" }),
    card(4, 1011, 50 + U, 50 + 2 * U, { text: "x" }),
    card(5, 1031, 50, 300, { text: "n" }),
  );

  test("maps every card to its span and every line to its cards", () => {
    const out = run(t).last;
    expect(out.text).toBe(
      "/** @table 50 50 0 */\n[define{draw}]\n[repeat][num{3}]\n  [set{x}to]\n\n/** @table 50 300 0 */\n[global{n}]",
    );
    expect(out.map.cards).toEqual([
      { track: 1, span: { line: 2, start: 0, end: 14 } },
      { track: 2, span: { line: 3, start: 0, end: 8 } },
      { track: 3, span: { line: 3, start: 8, end: 16 } },
      { track: 4, span: { line: 4, start: 2, end: 12 } },
      { track: 5, span: { line: 7, start: 0, end: 11 } },
    ]);
    expect(out.map.lines).toEqual([
      { line: 2, tracks: [1] },
      { line: 3, tracks: [2, 3] },
      { line: 4, tracks: [4] },
      { line: 7, tracks: [5] },
    ]);
  });

  test("is tied to the buffer version, which moves only when the text changes", () => {
    // Nudged by less than half a mm, so no @table tag moves either.
    const moved = table(...t.cards.map((c) => ({ ...c, x: c.x + 0.3 })));
    const changed = table(...t.cards.slice(0, 3));
    const r = run(t, moved, changed);
    expect(r.outputs.map((o) => o.map.version)).toEqual(r.outputs.map((o) => o.version));
    const [a, b, c] = r.outputs.map((o) => o.version);
    expect(b).toBe(a);
    expect(c).not.toBe(b);
  });
});

describe("the step function", () => {
  test("is pure: the same state and table give the same output, and nothing passed in changes", () => {
    const t = table(head, set, num(0, 0));
    const start = run(table(head, set, num(0, 0))).state;
    const before = JSON.stringify(t);
    const joinsBefore = [...start.joins];
    const input = { table: t, layout, lockfile, languageMarkers };
    const a = step(start, input);
    const b = step(start, input);
    expect(a).toEqual(b);
    expect(JSON.stringify(t)).toBe(before);
    expect([...start.joins]).toEqual(joinsBefore);
  });

  test("carries what it needs only in the state it returns", () => {
    // The same table at 14 mm reads joined after a join was made, and split from a fresh state.
    const made = run(table(head, set, num(0, 0))).state;
    const input = { table: table(head, set, num(14, 0)), layout, lockfile, languageMarkers };
    expect(code(step(made, input).output.text)).toBe("[define{setup}]\n[set{x}to][num{250}]");
    expect(code(step(initialState(), input).output.text)).toBe("[define{setup}]\n[set{x}to]");
  });
});

describe("settings", () => {
  test("every threshold is a named setting with the prototypes' starting value", () => {
    expect(defaultSettings).toEqual({
      unitMm: 30,
      markerAlongMm: 8.5,
      markerDownMm: 15,
      maxAngleDeg: 15,
      joinMakeAlongMinMm: -8,
      joinMakeAlongMaxMm: 10,
      joinMakeAcrossMm: 6,
      joinKeepAlongMinMm: -8,
      joinKeepAlongMaxMm: 15,
      joinKeepAcrossMm: 9,
      lineMakeMm: 10,
      lineKeepMm: 15,
    });
  });

  test("the rig can tune a threshold through the step's settings", () => {
    const input = { table: table(head, set, num(11, 0)), layout, lockfile, languageMarkers };
    expect(code(step(initialState(), { ...input, settings: { joinMakeAlongMaxMm: 12 } }).output.text)).toBe(
      "[define{setup}]\n[set{x}to][num{250}]",
    );
    const turned = { ...input, table: table(head, set, num(2, 0, 16)) };
    expect(code(step(initialState(), { ...turned, settings: { maxAngleDeg: 20 } }).output.text)).toBe(
      "[define{setup}]\n[set{x}to][num{250}]",
    );
  });
});
