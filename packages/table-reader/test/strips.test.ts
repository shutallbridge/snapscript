import { describe, expect, test } from "vitest";
import { initialState, step } from "../src/index.ts";
import {
  card,
  code,
  DEDENT,
  DEFINE,
  GET,
  languageMarkers,
  layout,
  lockfile,
  NUM,
  ON_LOAD,
  REPEAT,
  run,
  SET,
  table,
  U,
} from "./fixtures.ts";

describe("@table tags", () => {
  test("each strip is written with its first card's top-left corner and turn, in whole mm and degrees", () => {
    const t = table(
      card(1, DEFINE, 120.4, 39.6, { text: "setup" }),
      card(2, SET, 120.4, 39.6 + U, { text: "x" }),
      card(3, DEFINE, 40, 210, { angle: 15.3, text: "draw" }),
    );
    expect(run(t).last.text).toBe(
      "/** @table 120 40 0 */\n[define{setup}]\n[set{x}to]\n\n/** @table 40 210 15 */\n[define{draw}]",
    );
  });

  test("are measured from the coding space's top-left, not the table's", () => {
    const shifted = { ...layout, codingSpace: { x: 20, y: 10, width: 400, height: 600 } };
    const out = step(initialState(), {
      table: table(card(1, DEFINE, 150, 60, { angle: -2.6, text: "setup" })),
      layout: shifted,
      lockfile,
      languageMarkers,
    }).output;
    expect(out.text).toBe("/** @table 130 50 -3 */\n[define{setup}]");
  });
});

describe("moving a whole strip", () => {
  const strip = (dx: number, dy: number) => [
    card(1, DEFINE, 50 + dx, 50 + dy, { text: "setup" }),
    card(2, SET, 50 + dx, 50 + U + dy, { text: "x" }),
    card(3, NUM, 50 + 4 * U + dx, 50 + U + dy, { text: "250" }),
  ];

  test("changes only its @table tag, and says so", () => {
    const r = run(table(...strip(0, 0)), table(...strip(60, 25)));
    expect(r.outputs.map((o) => o.text)).toEqual([
      "/** @table 50 50 0 */\n[define{setup}]\n[set{x}to][num{250}]",
      "/** @table 110 75 0 */\n[define{setup}]\n[set{x}to][num{250}]",
    ]);
    expect(r.last.placementOnly).toBe(true);
  });

  test("a change to the program isn't placement only, even with a move", () => {
    const r = run(table(...strip(0, 0)), table(...strip(60, 25).slice(0, 2)));
    expect(r.last.placementOnly).toBe(false);
  });

  test("a step that changes nothing isn't placement only", () => {
    const r = run(table(...strip(0, 0)), table(...strip(0, 0)));
    expect(r.last.placementOnly).toBe(false);
    expect(r.last.version).toBe(r.outputs[0].version);
  });

  test("the first step that lays a strip changes the program", () => {
    expect(run(table(...strip(0, 0))).last.placementOnly).toBe(false);
  });
});

describe("strip heads", () => {
  test("the output lists the recognised strip heads, in buffer order", () => {
    const r = run(
      table(card(1, DEFINE, 50, 300, { text: "draw" }), card(2, SET, 50, 300 + U, { text: "x" })),
      table(
        card(1, DEFINE, 50, 300, { text: "draw" }),
        card(2, SET, 50, 300 + U, { text: "x" }),
        card(3, ON_LOAD, 50, 50),
      ),
    );
    expect(r.last.stripHeads).toEqual([1, 3]);
  });
});

describe("detached lines", () => {
  const setup = card(1, DEFINE, 50, 50, { text: "setup" });

  test("cards that join no strip come back as detached lines, grouped into lines, and stay out of the buffer", () => {
    const out = run(
      table(
        setup,
        card(2, SET, 200, 300, { text: "x" }),
        card(3, NUM, 200 + 4 * U, 300, { text: "1" }),
        card(4, GET, 200, 400, { text: "y" }),
      ),
    ).last;
    expect(code(out.text)).toBe("[define{setup}]");
    expect(out.detached).toEqual([
      { tracks: [2, 3], text: "[set{x}to][num{1}]" },
      { tracks: [4], text: "[get{y}]" },
    ]);
  });

  test("of two cards that could fill one place in a line, the nearer wins and the other is detached", () => {
    const out = run(
      table(
        setup,
        card(2, SET, 50, 50 + U, { text: "x" }),
        card(3, NUM, 50 + 4 * U + 6, 50 + U, { text: "1" }),
        card(4, NUM, 50 + 4 * U + 2, 50 + U + 3, { text: "2" }),
      ),
    ).last;
    expect(code(out.text)).toBe("[define{setup}]\n[set{x}to][num{2}]");
    expect(out.detached).toEqual([{ tracks: [3], text: "[num{1}]" }]);
  });

  test("of two lines that could sit below one line head, the nearer wins and the other is detached", () => {
    const out = run(
      table(
        setup,
        card(2, SET, 50 + 7, 50 + U, { text: "x" }),
        card(3, GET, 50 + 1, 50 + U + 2, { text: "y" }),
      ),
    ).last;
    expect(code(out.text)).toBe("[define{setup}]\n[get{y}]");
    expect(out.detached).toEqual([{ tracks: [2], text: "[set{x}to]" }]);
  });

  test("a whole line under a detached line head is detached with it", () => {
    const out = run(
      table(card(2, REPEAT, 200, 300), card(3, SET, 200 + U, 300 + U, { text: "x" }), card(4, DEDENT, 200, 300 + 2 * U)),
    ).last;
    expect(out.text).toBe("");
    expect(out.detached.map((l) => l.tracks)).toEqual([[2], [3], [4]]);
  });
});

describe("strip order", () => {
  const setup = (y: number, track = 1) => card(track, DEFINE, 50, y, { text: "setup" });
  const draw = (y: number) => card(2, DEFINE, 200, y, { text: "draw" });
  const strips = (text: string) => code(text).split("\n\n");

  test("a strip keeps its place while its head stays, wherever it is moved", () => {
    const r = run(table(setup(50), draw(300)), table(setup(400), draw(100)));
    expect(strips(r.last.text)).toEqual(["[define{setup}]", "[define{draw}]"]);
  });

  test("a new strip goes at the end, even laid above the others", () => {
    const r = run(table(setup(300)), table(setup(300), draw(20)));
    expect(strips(r.last.text)).toEqual(["[define{setup}]", "[define{draw}]"]);
  });

  test("a head lifted and laid again is a new strip, and goes at the end", () => {
    const r = run(table(setup(50), draw(300)), table(draw(300)), table(setup(50, 7), draw(300)));
    expect(strips(r.last.text)).toEqual(["[define{draw}]", "[define{setup}]"]);
  });

  describe("from the starting text", () => {
    const entry = [
      "[import(snapscript-p5)as(p5)]",
      "",
      "/** @table hidden */",
      "[define{helper}]",
      "[return][num{1}]",
      "",
      "/**",
      " * Runs once.",
      " * @table 120 40",
      " */",
      "[define{setup}]",
      "[call(p5.createCanvas)][num{500}][num{500}]",
    ].join("\n");
    const from = (...tables: ReturnType<typeof table>[]) => {
      let state = initialState(entry);
      let last;
      for (const t of tables) ({ state, output: last } = step(state, { table: t, layout, lockfile, languageMarkers }));
      return last!;
    };

    // Its placed strip is now stand-ins, written back with its turn.
    const written = entry.replace("@table 120 40", "@table 120 40 0");

    test("an empty table gives the starting text back, its placed strips as stand-ins", () => {
      expect(from(table()).text).toBe(written);
    });

    test("its strips keep their order, and the table's strips go after them", () => {
      const out = from(table(card(2, DEFINE, 50, 300, { text: "draw" })));
      expect(out.text).toBe(`${written}\n\n/** @table 50 300 0 */\n[define{draw}]`);
      expect(out.map.cards.at(-1)).toEqual({ track: 2, span: { line: 15, start: 0, end: 14 } });
    });
  });
});
