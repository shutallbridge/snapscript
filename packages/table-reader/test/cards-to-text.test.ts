import { describe, expect, test } from "vitest";
import type { Handwriting } from "../src/index.ts";
import { initialState, step } from "../src/index.ts";
import {
  card,
  CIRCLE,
  DEFINE,
  GET,
  languageMarkers,
  layout,
  lockfile,
  NUM,
  PLAY,
  run,
  runFrom,
  SET,
  table,
  U,
} from "./fixtures.ts";

// Every strip here lies with its first card's top-left at (50, 50) on the coding space, unturned (#166).
const TAG = "/** @table 50 50 0 */\n";

// [define{draw}] with [set{x}to][get{…}] under it, the [get{…}] in the given handwriting state.
const draw = card(1, DEFINE, 50, 50, { text: "draw" });
const set = card(2, SET, 50, 50 + U, { text: "x" });
const get = (hw: Handwriting) => ({ ...card(3, GET, 50 + 4 * U, 50 + U), hw });

describe("handwriting", () => {
  test("a read goes in as read, with brackets dropped", () => {
    expect(run(table(draw, set, get({ state: "read", text: "a}b" }))).last.text).toBe(
      TAG + "[define{draw}]\n[set{x}to][get{ab}]",
    );
    expect(run(table(draw, set, get({ state: "read", text: "(a)[b]{c}" }))).last.text).toBe(
      TAG + "[define{draw}]\n[set{x}to][get{abc}]",
    );
  });

  test("a read that breaks its card's rule goes in as written", () => {
    const num = { ...card(3, NUM, 50 + 4 * U, 50 + U), hw: { state: "read", text: "4o" } as Handwriting };
    const out = run(table(draw, set, num)).last;
    expect(out.text).toBe(TAG + "[define{draw}]\n[set{x}to][num{4o}]");
    expect(out.skippedLines).toEqual([]);
  });

  test("blank goes in as empty braces and isn't skipped", () => {
    const out = run(table(draw, set, get({ state: "blank" }))).last;
    expect(out.text).toBe(TAG + "[define{draw}]\n[set{x}to][get{}]");
    expect(out.skippedLines).toEqual([]);
  });

  test("a card being read again with kept text counts as read", () => {
    const out = run(table(draw, set, get({ state: "reading", text: "y" }))).last;
    expect(out.text).toBe(TAG + "[define{draw}]\n[set{x}to][get{y}]");
    expect(out.skippedLines).toEqual([]);
  });

  test.each([
    ["not read yet", { state: "not read yet" }],
    ["a card being read with no kept text", { state: "reading" }],
    ["read error", { state: "read error" }],
    ["connection error", { state: "connection error" }],
  ] as [string, Handwriting][])("%s: empty braces, and its line skipped with that reason", (_, hw) => {
    const out = run(table(draw, set, get(hw))).last;
    expect(out.text).toBe(TAG + "[define{draw}]\n[set{x}to][get{}]");
    const reason = hw.state === "reading" ? "not read yet" : hw.state;
    expect(out.skippedLines).toEqual([{ line: 3, reason }]);
  });

  test("an unread card's line is skipped even when the card's own text would be stale", () => {
    // A [num{…}] with a read error keeps no text, even if the vision service sent one along.
    const num = { ...card(3, NUM, 50 + 4 * U, 50 + U), hw: { state: "read error", text: "5" } as Handwriting };
    const out = run(table(draw, set, num)).last;
    expect(out.text).toBe(TAG + "[define{draw}]\n[set{x}to][num{}]");
    expect(out.skippedLines).toEqual([{ line: 3, reason: "read error" }]);
  });

  test("a handwritten line head that isn't read yet skips its own line only", () => {
    const head = { ...card(2, SET, 50, 50 + U), hw: { state: "not read yet" } as Handwriting };
    const below = card(4, SET, 50, 50 + 2 * U, { text: "y" });
    const out = run(table(draw, head, below)).last;
    expect(out.text).toBe(TAG + "[define{draw}]\n[set{}to]\n[set{y}to]");
    expect(out.skippedLines).toEqual([{ line: 3, reason: "not read yet" }]);
  });
});

describe("the entry text's hidden lines", () => {
  const p5 = "/** @table hidden */\n[import(snapscript-p5)as(p5)]";

  test("an [import] with its doc comment comes back exactly as written, above the strips", () => {
    const out = runFrom(p5, table(draw, set, get({ state: "read", text: "y" }))).last;
    expect(out.text).toBe(`${p5}\n\n${TAG}[define{draw}]\n[set{x}to][get{y}]`);
  });

  test("lines in the card-to-text map and skipped lines count from the top of the buffer", () => {
    const out = runFrom(p5, table(draw, set, get({ state: "not read yet" }))).last;
    expect(out.map.lines).toEqual([
      { line: 5, tracks: [1] },
      { line: 6, tracks: [2, 3] },
    ]);
    expect(out.map.cards[0]).toEqual({ track: 1, span: { line: 5, start: 0, end: 14 } });
    expect(out.skippedLines).toEqual([{ line: 6, reason: "not read yet" }]);
  });

  test("[import]s and [extern]s keep their comments, spacing and order", () => {
    const entry = [
      "/**",
      " * Draws a circle.",
      " * @param {num} x  how far from the left",
      " * @table hidden",
      " */",
      "[extern(circle)][required(x)]",
      "/** @table hidden */ [import(snapscript-p5)as(sketch)]",
      "",
      "// sound",
      "[import(snapscript-sound)as(sound)]",
    ].join("\n");
    expect(runFrom(entry, table()).last.text).toBe(entry);
  });

  test("an empty table gives back only the hidden lines", () => {
    expect(runFrom(p5, table()).last.text).toBe(p5);
  });

  test("the reader never adds an [import]", () => {
    expect(run(table(draw, card(2, CIRCLE, 50, 50 + U))).last.text).toBe(TAG + "[define{draw}]\n[call{}]");
  });
});

describe("library cards", () => {
  // CIRCLE is `call snapscript-p5.circle` (3U), with a [num{250}] after it.
  const line = table(draw, card(2, CIRCLE, 50, 50 + U), card(3, NUM, 50 + 3 * U, 50 + U, { text: "250" }));

  test.each([
    ["p5", "[call(p5.circle)]"],
    ["sketch", "[call(sketch.circle)]"],
  ])("take their local name from the program's import as %s", (as, written) => {
    const out = runFrom(`[import(snapscript-p5)as(${as})]`, line).last;
    expect(out.text).toBe(`[import(snapscript-p5)as(${as})]\n\n${TAG}[define{draw}]\n${written}[num{250}]`);
    expect(out.skippedLines).toEqual([]);
    expect(out.unknownCards).toEqual([]);
  });

  test("a package imported without as(…) gives its cards no name, so they're unknown", () => {
    const out = runFrom("[import(snapscript-p5)]", line).last;
    expect(out.text).toBe(`[import(snapscript-p5)]\n\n${TAG}[define{draw}]\n[call{}][num{250}]`);
    expect(out.skippedLines).toEqual([{ line: 5, reason: "unknown card" }]);
  });
});

describe("unknown cards", () => {
  const p5 = "[import(snapscript-p5)as(p5)]";

  test("a library card whose library isn't imported: empty braces, its line skipped, and listed", () => {
    // PLAY is `call snapscript-sound.play`, with a [num{3}] after it.
    const t = table(draw, card(2, PLAY, 50, 50 + U), card(3, NUM, 50 + 3 * U, 50 + U, { text: "3" }));
    const out = runFrom(p5, t).last;
    expect(out.text).toBe(`${p5}\n\n${TAG}[define{draw}]\n[call{}][num{3}]`);
    expect(out.skippedLines).toEqual([{ line: 5, reason: "unknown card" }]);
    expect(out.unknownCards).toEqual([{ track: 2, marker: PLAY, package: "snapscript-sound" }]);
    expect(out.map.cards[1]).toEqual({ track: 2, span: { line: 5, start: 0, end: 8 } });
  });

  test("a marker missing from the lockfile writes nothing, and its line is skipped and listed", () => {
    const t = table(draw, set, card(3, 4321, 50 + 4 * U, 50 + U));
    const out = runFrom(p5, t).last;
    expect(out.text).toBe(`${p5}\n\n${TAG}[define{draw}]\n[set{x}to]`);
    expect(out.skippedLines).toEqual([{ line: 5, reason: "unknown card" }]);
    expect(out.unknownCards).toEqual([{ track: 3, marker: 4321 }]);
    expect(out.map.lines[1]).toEqual({ line: 5, tracks: [2, 3] });
    expect(out.map.cards[2]).toEqual({ track: 3, span: { line: 5, start: 10, end: 10 } });
  });

  test.each([2, 3, 5, 7])(
    "the cards after a %iU card missing from the lockfile stay in its line, one skipped line",
    (length) => {
      // The table doesn't know the unknown card's length, but every card is a whole number of U, at least 2U.
      const t = table(
        draw,
        set,
        card(3, 4321, 50 + 4 * U, 50 + U),
        card(4, NUM, 50 + (4 + length) * U, 50 + U, { text: "3" }),
      );
      const out = runFrom(p5, t).last;
      expect(out.text).toBe(`${p5}\n\n${TAG}[define{draw}]\n[set{x}to][num{3}]`);
      expect(out.map.lines[1]).toEqual({ line: 5, tracks: [2, 3, 4] });
      expect(out.skippedLines).toEqual([{ line: 5, reason: "unknown card" }]);
      expect(out.detached).toEqual([]);
    },
  );

  test("a line with an unknown card and a card not read yet is skipped as unknown", () => {
    const t = table(draw, card(2, PLAY, 50, 50 + U), { ...card(3, NUM, 50 + 3 * U, 50 + U), hw: { state: "not read yet" } });
    expect(runFrom(p5, t).last.skippedLines).toEqual([{ line: 5, reason: "unknown card" }]);
  });

  test("a library strip head whose library isn't imported still starts its strip", () => {
    const setup = { kind: "library", card: "define", package: "snapscript-p5", name: "setup", length: 4 } as const;
    const input = (entry: string) =>
      step(initialState(entry), {
        table: table(card(1, 1700, 50, 50), card(2, SET, 50, 50 + U, { text: "x" })),
        layout,
        lockfile: new Map([...lockfile, [1700, setup]]),
        languageMarkers,
      }).output;
    expect(input("").text).toBe(TAG + "[define{}]\n[set{x}to]");
    expect(input("").skippedLines).toEqual([{ line: 2, reason: "unknown card" }]);
    expect(input(p5).text).toBe(`${p5}\n\n${TAG}[define(setup)]\n[set{x}to]`);
  });
});
