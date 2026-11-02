// Imports and library declarations (REFERENCE.md §5, #164), through
// check(text, skippedLines, { loader }), with an in-memory module loader
// holding a small made-up snapscript-p5.
import { describe, expect, test } from "vitest";
import { check, type ModuleLoader, type SkippedLine } from "@snapscript/checker";
import { lines } from "./helpers.ts";

const p5 = lines(
  "// snapscript-p5, made up for the tests",
  "[global(frameCount)][num(0)]",
  "",
  "[extern(createCanvas)][required(width)][required(height)]",
  "[extern(background)][required(color)]",
  "[extern(noStroke)]",
  "[extern(rect)][required(x)][required(y)][required(w)][required(h)]",
  "/**",
  " * @param {num} x",
  " * @param {num} y",
  " * @param {num} d  its diameter",
  " */",
  "[extern(circle)][required(x)][required(y)][required(d)]",
  "",
  "/** @param {color} color */",
  "[extern(fill)][required(color)]",
  "[extern(fill)][required(r)][required(g)][required(b)]",
  "",
  "[define(star)][required(x)][required(y)]",
  "[call(circle)][get(x)][get(y)][num(5)]",
);

/**
 * A loader over files held in memory, by path from the project's root.
 * Packages live in `node_modules/<name>/`, with a `package.json` whose
 * `"snapscript"` entry names the package's module.
 */
function memoryLoader(files: Record<string, string>): ModuleLoader {
  const all: Record<string, string> = {
    "node_modules/snapscript-p5/package.json": JSON.stringify({ name: "snapscript-p5", snapscript: "p5.snap" }),
    "node_modules/snapscript-p5/p5.snap": p5,
    ...files,
  };
  return {
    load(source, from) {
      let id: string;
      if (/^\.\.?\//.test(source)) {
        const dir = from === null ? [] : from.split("/").slice(0, -1);
        for (const part of source.split("/")) {
          if (part === "..") dir.pop();
          else if (part !== ".") dir.push(part);
        }
        id = dir.join("/");
      } else {
        const manifest = all[`node_modules/${source}/package.json`];
        if (manifest === undefined) return null;
        id = `node_modules/${source}/${JSON.parse(manifest).snapscript}`;
      }
      const text = all[id];
      return text === undefined ? null : { id, text };
    },
  };
}

const withP5 = (...body: string[]): string => lines("[import(snapscript-p5)as(p5)]", "", "[define{draw}]", ...body);

function errorsOf(text: string, files: Record<string, string> = {}, options: { id?: string; skipped?: SkippedLine[] } = {}) {
  return check(text, options.skipped ?? [], { loader: memoryLoader(files), id: options.id })
    .errors.map(({ kind, line, message }) => ({ kind, line, message }));
}

describe("[extern(…)]s give a library's functions their values", () => {
  test("[call(p5.circle)][num{20}] is a TypeError: circle takes 3 values", () => {
    expect(errorsOf(withP5("[call(p5.circle)][num{20}]"))).toEqual([
      { kind: "TypeError", line: 4, message: "circle takes 3 values" },
    ]);
  });
});

describe("the importing program chooses the name", () => {
  test("as(sketch) makes sketch.circle resolve the same way", () => {
    const text = lines(
      "[import(snapscript-p5)as(sketch)]",
      "",
      "[define{draw}]",
      "[call(sketch.circle)][num{1}][num{2}][num{3}]",
      "[call(sketch.circle)][num{20}]",
    );
    expect(errorsOf(text)).toEqual([{ kind: "TypeError", line: 5, message: "circle takes 3 values" }]);
  });

  test("names ignore case: [call(P5.CIRCLE)] is p5's circle", () => {
    expect(errorsOf(withP5("[call(P5.CIRCLE)][num{20}]"))).toEqual([{ kind: "TypeError", line: 4, message: "circle takes 3 values" }]);
  });
});

describe("§5 a module that can't load is an ImportError", () => {
  test("[import(./missing.snap)as(m)] is an ImportError", () => {
    expect(errorsOf(lines("[import(./missing.snap)as(m)]"))).toEqual([
      { kind: "ImportError", line: 1, message: "./missing.snap can't be found" },
    ]);
  });

  test("a package that isn't installed is an ImportError", () => {
    expect(errorsOf(lines("[import(snapscript-sound)as(sound)]"))).toEqual([
      { kind: "ImportError", line: 1, message: "snapscript-sound isn't installed" },
    ]);
  });

  test("a missing module's line is skipped, and what uses it follows from it", () => {
    const text = lines("[import(./missing.snap)as(m)]", "[define{draw}]", "[call(m.star)][num{1}]", "[call(print)][str{runs}]");
    const { errors, program } = check(text, [], { loader: memoryLoader({}) });
    expect(errors.map(({ kind, line, followsFrom }) => ({ kind, line, followsFrom }))).toEqual([
      { kind: "ImportError", line: 1, followsFrom: null },
      { kind: "NameError", line: 3, followsFrom: 1 },
    ]);
    expect(program.skippedLines).toEqual([1, 3]);
  });

  test("a module that imports itself directly is an ImportError", () => {
    const main = lines("[import(./main.snap)as(again)]");
    expect(errorsOf(main, { "main.snap": main }, { id: "main.snap" })).toEqual([
      { kind: "ImportError", line: 1, message: "this module imports itself" },
    ]);
  });

  test("a module that imports itself through another module is an ImportError", () => {
    const main = lines("[import(./shapes.snap)as(shapes)]");
    const files = { "main.snap": main, "shapes.snap": lines("[import(./main.snap)as(main)]") };
    expect(errorsOf(main, files, { id: "main.snap" })).toEqual([
      { kind: "ImportError", line: 1, message: "this module imports itself, through ./shapes.snap" },
    ]);
  });

  test("through several modules, each named as its importer wrote it", () => {
    const main = lines("[import(./a.snap)as(a)]");
    const files = { "main.snap": main, "a.snap": lines("[import(./lib/b.snap)as(b)]"), "lib/b.snap": lines("[import(../main.snap)as(m)]") };
    expect(errorsOf(main, files, { id: "main.snap" })).toEqual([
      { kind: "ImportError", line: 1, message: "this module imports itself, through ./a.snap and ./lib/b.snap" },
    ]);
  });

  test("importing a module whose own imports loop is not this module's error", () => {
    const main = lines("[import(./a.snap)as(a)]", "[define{draw}]", "[call(a.f)]");
    const files = {
      "main.snap": main,
      "a.snap": lines("[import(./b.snap)as(b)]", "[define{f}]"),
      "b.snap": lines("[import(./a.snap)as(a)]"),
    };
    expect(errorsOf(main, files, { id: "main.snap" })).toEqual([]);
  });

  test("[import(snapscript-p5)] is a SyntaxError: a package needs as(…)", () => {
    expect(errorsOf(lines("[import(snapscript-p5)]"))).toEqual([
      { kind: "SyntaxError", line: 1, message: expect.stringContaining("a package needs as(…)") },
    ]);
  });
});

describe("§5 a module's attributes", () => {
  test("[call{p5.circel}] is an AttributeError", () => {
    expect(errorsOf(withP5("[call{p5.circel}]"))).toEqual([{ kind: "AttributeError", line: 4, message: "p5 has no circel" }]);
  });

  test("[get(p5.frameCount)] reads a global, whatever its case", () => {
    expect(errorsOf(withP5("[call(print)][get(p5.frameCount)][get{p5.framecount}]"))).toEqual([]);
  });

  test("[get{p5}][setProp{frameCount}to][num{0}] is an AttributeError: written only in its own file", () => {
    expect(errorsOf(withP5("[get{p5}][setProp{frameCount}to][num{0}]"))).toEqual([
      { kind: "AttributeError", line: 4, message: "p5 is another file's module: its attributes are written only in its own file" },
    ]);
  });

  test("a namespace on a card and a receiver to the left are the same thing", () => {
    const shapes = lines("[global(unit)][num(10)]", "[define(star)][required(x)][required(y)]");
    const text = lines(
      "[import(./shapes.snap)as(shapes)]",
      "[define{draw}]",
      "[call{shapes.star}][num{10}][num{10}]",
      "[get{shapes}][call{star}][num{10}][num{10}]",
      "[call(print)][get{shapes.unit}][get{shapes}][getProp{unit}]",
      "[call{shapes.star}][num{10}]",
      "[get{shapes}][call{star}][num{10}]",
      "[call(print)][get{shapes}][getProp{size}]",
    );
    expect(errorsOf(text, { "shapes.snap": shapes })).toEqual([
      { kind: "TypeError", line: 6, message: "star takes 2 values" },
      { kind: "TypeError", line: 7, message: "star takes 2 values" },
      { kind: "AttributeError", line: 8, message: "shapes has no size" },
    ]);
  });

  test("a library's [define(…)] is one of its functions", () => {
    expect(errorsOf(withP5("[call(p5.star)][num{1}][num{2}]", "[call(p5.star)]"))).toEqual([
      { kind: "TypeError", line: 5, message: "star takes 2 values" },
    ]);
  });

  test("a module's line with an error is skipped, so it isn't an attribute", () => {
    const shapes = lines("[define(star)][required(x)]", "[define(ring)][required(x)][required(y)]", "[define(ring)]");
    const text = lines("[import(./shapes.snap)as(shapes)]", "[define{draw}]", "[call(shapes.star)][num{1}]", "[call(shapes.ring)]");
    expect(errorsOf(text, { "shapes.snap": shapes })).toEqual([{ kind: "AttributeError", line: 4, message: "shapes has no ring" }]);
  });

  test("a module is a module, not a function", () => {
    expect(errorsOf(withP5("[call{p5}]"))).toEqual([{ kind: "TypeError", line: 4, message: "p5 is a module, not a function" }]);
  });
});

describe("each call card's expected values, by text position", () => {
  const at = (text: string, line: number, start: number, skipped: SkippedLine[] = []) =>
    check(text, skipped, { loader: memoryLoader({}) }).expectedValues.find((e) => e.at.line === line && e.at.start === start);
  const names = (values: { name: string }[]) => values.map((v) => v.name);
  const num = (name: string) => ({ name, type: "num" });

  test("[call(p5.circle)] expects x, y and d, each a num as its doc comment declares", () => {
    expect(at(withP5("[call(p5.circle)][num{1}][num{2}][num{3}]"), 4, 0)).toEqual({
      span: { start: 46, end: 63 },
      at: { line: 4, start: 0, end: 17 },
      name: "circle",
      overloads: [{ values: [num("x"), num("y"), num("d")], variadic: null }],
    });
  });

  test("[call(p5.fill)] has both overloads, in the order declared: a value with no declared type has none", () => {
    expect(at(withP5("[set{c}to][call(p5.fill)][color(gold)]"), 4, 10)?.overloads).toEqual([
      { values: [{ name: "color", type: "color" }], variadic: null },
      { values: [{ name: "r", type: null }, { name: "g", type: null }, { name: "b", type: null }], variadic: null },
    ]);
  });

  test("a type the language doesn't have, or more than one, gives no type", () => {
    const shapes = lines(
      "/**",
      " * @param {number} a",
      " * @param {num|str} b",
      " * @param c",
      " */",
      "[extern(ring)][required(a)][required(b)][required(c)]",
    );
    const text = lines("[import(./shapes.snap)as(shapes)]", "", "[define{draw}]", "[call(shapes.ring)]");
    const found = check(text, [], { loader: memoryLoader({ "shapes.snap": shapes }) }).expectedValues[0];
    expect(found?.overloads).toEqual([
      { values: [{ name: "a", type: null }, { name: "b", type: null }, { name: "c", type: null }], variadic: null },
    ]);
  });

  test("a half-built line, skipped with its error, still has them", () => {
    expect(at(withP5("[call(p5.circle)][num{20}]"), 4, 0)?.overloads).toEqual([{ values: [num("x"), num("y"), num("d")], variadic: null }]);
  });

  test("so does a skipped line the table read", () => {
    expect(at(withP5("[call(p5.circle)][num{1}]"), 4, 0, [{ line: 4 }])?.overloads).toEqual([{ values: [num("x"), num("y"), num("d")], variadic: null }]);
  });

  test("builtins, the file's own functions and nested calls have them too", () => {
    const text = withP5(
      "[call(p5.circle)][(][call(random)][num{500}][)][num{5}][num{5}]",
      "[call{size}][num{5}]",
      "",
      "/** @param {num} n */",
      "[define{size}][required{n}][optional{m}]",
    );
    const found = check(text, [], { loader: memoryLoader({}) }).expectedValues.map((e) => [e.at.line, e.at.start, e.name, e.overloads.map((o) => o.values)]);
    expect(found).toEqual([
      [4, 0, "circle", [[num("x"), num("y"), num("d")]]],
      // A builtin's types come from the language's table.
      [4, 20, "random", [[], [num("end")], [num("start"), num("end")]]],
      [5, 0, "size", [[num("n")], [num("n"), { name: "m", type: null }]]],
    ]);
  });

  test("turn into the table reader's value guide sources", () => {
    const { expectedValues } = check(withP5("[call(p5.fill)][num{1}][num{2}][num{3}]"), [], { loader: memoryLoader({}) });
    const sources = expectedValues.map(({ at: { line, start }, overloads }) => ({ version: 7, at: { line, start }, values: overloads[1].values }));
    expect(sources).toEqual([{ version: 7, at: { line: 4, start: 0 }, values: [{ name: "r", type: null }, { name: "g", type: null }, { name: "b", type: null }] }]);
    expect(names(sources[0].values)).toEqual(["r", "g", "b"]);
  });

  test("a variadic slot is named, with its type", () => {
    expect(at(withP5("[call(print)][num{1}]"), 4, 0)?.overloads).toEqual([{ values: [], variadic: { name: "values", type: null } }]);
  });

  test("a call whose function isn't known has none", () => {
    expect(at(withP5("[call{p5.circel}]"), 4, 0)).toBeUndefined();
  });
});

describe("§4.3 with the library's own declarations", () => {
  test("the skipping example: a call with too few values is skipped, and the rest runs", () => {
    const text = withP5(
      "[call(p5.circle)][num{5}][num{5}][num{2}]",
      "[set{x}to]",
      "[call(p5.circle)][num{5}]",
      "[if][get{a}][>]",
      "  [call(print)][get{a}]",
      "[dedent]",
    );
    const { errors, program } = check(text, [], { loader: memoryLoader({}) });
    expect(errors.filter((e) => e.kind !== "NameError").map(({ kind, line, message }) => ({ kind, line, message }))).toEqual([
      { kind: "SyntaxError", line: 5, message: expect.any(String) },
      { kind: "TypeError", line: 6, message: "circle takes 3 values" },
      { kind: "SyntaxError", line: 7, message: expect.any(String) },
    ]);
    expect(program.skippedLines).toEqual([5, 6, 7, 8, 9]);
  });

  test("NameError, from the line above: skipped", () => {
    const text = withP5("[set{x}to]", "[call(p5.circle)][get{x}][num{20}][num{20}]");
    const { errors } = check(text, [], { loader: memoryLoader({}) });
    expect(errors.map(({ kind, line, followsFrom }) => ({ kind, line, followsFrom }))).toEqual([
      { kind: "SyntaxError", line: 4, followsFrom: null },
      { kind: "NameError", line: 5, followsFrom: 4 },
    ]);
  });

  test("demo program 1 (#109) checks with no errors against the library", () => {
    const confetti = (color: string) => [
      `[call(p5.fill)][color(${color})]`,
      "[repeat][num{200}]",
      "  [set{x}to][call(random)][num{500}]",
      "  [set{y}to][call(random)][num{500}]",
      "  [call(p5.rect)][get{x}][get{y}][num{10}][num{16}]",
      "[dedent]",
    ];
    const text = lines(
      "[import(snapscript-p5)as(p5)]",
      "",
      "[define(setup)]",
      "[call(p5.createCanvas)][num{500}][num{500}]",
      "[call(p5.background)][color(mediumblue)]",
      "[call(p5.noStroke)]",
      ...confetti("gold"),
      ...confetti("hotpink"),
      ...confetti("aquamarine"),
    );
    const { errors, program } = check(text, [], { loader: memoryLoader({}) });
    expect(errors).toEqual([]);
    expect(program.skippedLines).toEqual([]);
  });
});
