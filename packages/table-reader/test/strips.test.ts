import { describe, expect, test } from "vitest";
import { initialState, step } from "../src/index.ts";
import { card, code, languageMarkers, layout, lockfile, run, table, U } from "./fixtures.ts";

describe("@table tags", () => {
  test("each strip is written with its first card's top-left corner and turn, in whole mm and degrees", () => {
    const t = table(
      card(1, 1000, 120.4, 39.6, { text: "setup" }),
      card(2, 1011, 120.4, 39.6 + U, { text: "x" }),
      card(3, 1000, 40, 210, { angle: 15.3, text: "draw" }),
    );
    expect(run(t).last.text).toBe(
      "/** @table 120 40 0 */\n[define{setup}]\n[set{x}to]\n\n/** @table 40 210 15 */\n[define{draw}]",
    );
  });

  test("are measured from the coding space's top-left, not the table's", () => {
    const shifted = { ...layout, codingSpace: { x: 20, y: 10, width: 400, height: 600 } };
    const out = step(initialState(), {
      table: table(card(1, 1000, 150, 60, { angle: -2.6, text: "setup" })),
      layout: shifted,
      lockfile,
      languageMarkers,
    }).output;
    expect(out.text).toBe("/** @table 130 50 -3 */\n[define{setup}]");
  });
});

describe("moving a whole strip", () => {
  const strip = (dx: number, dy: number) => [
    card(1, 1000, 50 + dx, 50 + dy, { text: "setup" }),
    card(2, 1011, 50 + dx, 50 + U + dy, { text: "x" }),
    card(3, 1024, 50 + 4 * U + dx, 50 + U + dy, { text: "250" }),
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

describe("strip order", () => {
  const setup = (y: number, track = 1) => card(track, 1000, 50, y, { text: "setup" });
  const draw = (y: number) => card(2, 1000, 200, y, { text: "draw" });
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

    test("an empty table gives the starting text back as written", () => {
      expect(from(table()).text).toBe(entry);
    });

    test("its strips keep their order, and the table's strips go after them", () => {
      const out = from(table(card(2, 1000, 50, 20, { text: "draw" })));
      expect(out.text).toBe(`${entry}\n\n/** @table 50 20 0 */\n[define{draw}]`);
      expect(out.map.cards).toEqual([{ track: 2, span: { line: 15, start: 0, end: 14 } }]);
    });
  });
});
