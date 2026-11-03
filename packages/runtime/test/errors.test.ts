// Runtime errors, library errors, stopping and frozen sketches (#187), through
// the run-a-program seam.
import { describe, expect, test } from "vitest";
import { lines, nativeOf, runProgram } from "./helpers.ts";

describe("runtime errors", () => {
  test("a native module's ValueError is a runtime error at the calling card, and the run stops", async () => {
    const seen = await runProgram(
      lines(
        "[import(./checks.snap)as(checks)]",
        "",
        "[on(load)]",
        "[call(print)][str{before}]",
        "[call(checks.positive)][num{0}]",
        "[call(print)][str{after}]",
      ),
    );
    expect(seen.checkErrors).toEqual([]);
    expect(seen.errors).toEqual([
      { type: "runtime", kind: "ValueError", message: "0 is not positive", at: { line: 5, card: "[call(checks.positive)]" } },
    ]);
    expect(seen.prints.map((p) => p.text)).toEqual(["before"]);
  });

  test("anything else a native module throws is a library error naming the library and function", async () => {
    const seen = await runProgram(
      lines("[import(./checks.snap)as(checks)]", "", "[on(load)]", "[call(checks.broken)]", "[call(print)][str{after}]"),
    );
    expect(seen.errors).toEqual([
      {
        type: "library",
        kind: null,
        message: "checks broke inside broken: Cannot read properties of undefined (reading 'size')",
        at: { line: 4, card: "[call(checks.broken)]" },
      },
    ]);
    expect(seen.prints).toEqual([]);
  });

  test("a runtime error raised in a library's .snap code is reported at the table's calling card", async () => {
    const seen = await runProgram(
      lines("[import(./checks.snap)as(checks)]", "", "[on(load)]", "[call(print)][call(checks.guess)][bool(false)]"),
    );
    expect(seen.errors).toEqual([
      { type: "runtime", kind: "NameError", message: "n is a local of guess, not set yet", at: { line: 4, card: "[call(checks.guess)]" } },
    ]);
  });

  test("after a runtime error every [on(stop)] runs, an imported module's first", async () => {
    const seen = await runProgram(
      lines(
        "[import(./checks.snap)as(checks)]",
        "[import(./stopping.snap)as(stopping)]",
        "",
        "[on(load)]",
        "[call(checks.positive)][num{-1}]",
        "",
        "[on(stop)]",
        "[call(print)][str{main_stopped}]",
      ),
    );
    expect(seen.errors.map((e) => e.kind)).toEqual(["ValueError"]);
    expect(seen.prints).toEqual([
      { text: "stopping stopped", at: null },
      { text: "main stopped", at: { line: 8, card: "[call(print)]" } },
    ]);
  });

  test("a ZeroDivisionError stops the run and runs [on(stop)]", async () => {
    const seen = await runProgram(
      lines(
        "[on(load)]",
        "[call(print)][num{1}][/][num{0}]",
        "[call(print)][str{after}]",
        "",
        "[on(stop)]",
        "[call(print)][str{stopped}]",
      ),
    );
    expect(seen.errors).toEqual([
      { type: "runtime", kind: "ZeroDivisionError", message: expect.any(String), at: { line: 2, card: "[/]" } },
    ]);
    expect(seen.prints).toEqual([{ text: "stopped", at: { line: 6, card: "[call(print)]" } }]);
  });
});

describe("errors the checker can't see", () => {
  test("a function value given the wrong number of values says how many it takes, as the checker does", async () => {
    const seen = await runProgram(
      lines(
        "[define{add}][required{a}][required{b}]",
        "[return][get{a}][+][get{b}]",
        "",
        "[on(load)]",
        "[set{f}to][get{add}]",
        "[call{f}][num{1}]",
        "[set{g}to][get{random}]",
        "[call{g}][num{1}][num{2}][num{3}]",
      ),
    );
    expect(seen.checkErrors).toEqual([]);
    expect(seen.errors).toEqual([{ type: "runtime", kind: "TypeError", message: "add takes 2 values", at: { line: 6, card: "[call{f}]" } }]);
    const builtin = await runProgram(lines("[on(load)]", "[set{g}to][get{random}]", "[call{g}][num{1}][num{2}][num{3}]"));
    expect(builtin.errors).toEqual([{ type: "runtime", kind: "TypeError", message: "random takes 0 to 2 values", at: { line: 3, card: "[call{g}]" } }]);
  });

  test("setting an attribute of a value that has none lights the [setProp] card, not the call that led there", async () => {
    const seen = await runProgram(
      lines("[define{poke}][required{thing}]", "[get{thing}][setProp{size}to][num{2}]", "", "[on(load)]", "[call{poke}][num{1}]"),
    );
    expect(seen.checkErrors).toEqual([]);
    expect(seen.errors).toEqual([
      { type: "runtime", kind: "AttributeError", message: "num attributes can't be set here", at: { line: 2, card: "[setProp{size}to]" } },
    ]);
  });
});

describe("stopping", () => {
  const program = lines(
    "[import(./checks.snap)as(checks)]",
    "[import(./stopping.snap)as(stopping)]",
    "",
    "[define{frame}]",
    "[call(checks.positive)][num{0}]",
    "",
    "[on(load)]",
    "[call(checks.later)][get{frame}]",
    "",
    "[on(stop)]",
    "[call(print)][str{main_stopped}]",
  );
  const fire = async () => ((await nativeOf("checks.js")).fire as () => void)();

  test("stop() runs every [on(stop)]", async () => {
    const seen = await runProgram(lines("[import(./stopping.snap)as(stopping)]", "", "[on(stop)]", "[call(print)][str{main_stopped}]"), [], {
      stop: true,
    });
    expect(seen.errors).toEqual([]);
    expect(seen.prints.map((p) => p.text)).toEqual(["stopping stopped", "main stopped"]);
  });

  test("an error in a native module's later call into the program stops the run once; it runs no more", async () => {
    const seen = await runProgram(program, [], {
      then: async () => {
        await fire();
        await fire();
      },
      stop: true,
    });
    expect(seen.errors).toEqual([
      { type: "runtime", kind: "ValueError", message: "0 is not positive", at: { line: 5, card: "[call(checks.positive)]" } },
    ]);
    expect(seen.prints.map((p) => p.text)).toEqual(["stopping stopped", "main stopped"]);
    expect((await nativeOf("checks.js")).calls).toEqual([["positive", 0]]);
  });
});

describe("RecursionError", () => {
  // down(n) calls itself until n is 1: n calls deep in all.
  const deep = (n: number) =>
    lines(
      "[define{down}][required{n}]",
      "[if][get{n}][>][num{1}]",
      "  [call{down}][get{n}][-][num{1}]",
      "[dedent]",
      "",
      "[on(load)]",
      `[call{down}][num{${n}}]`,
      "[call(print)][str{done}]",
    );

  test("calls 999 deep run", async () => {
    const seen = await runProgram(deep(999));
    expect(seen.errors).toEqual([]);
    expect(seen.prints.map((p) => p.text)).toEqual(["done"]);
  });

  test("a call 1000 deep is a RecursionError at its card", async () => {
    const seen = await runProgram(deep(1000));
    expect(seen.errors).toEqual([
      { type: "runtime", kind: "RecursionError", message: "maximum recursion depth exceeded", at: { line: 3, card: "[call{down}]" } },
    ]);
    expect(seen.prints).toEqual([]);
  });
});

describe("a frozen sketch", () => {
  test("another thread reads the card a stuck [on(load)] is at", async () => {
    const seen = await runProgram(
      lines("[on(load)]", "[call(print)][str{start}]", "[repeat][num{1000000000}]", "  [set{x}to][num{1}]", "[dedent]"),
      [],
      { limit: 400 },
    );
    expect(seen.prints.map((p) => p.text)).toEqual(["start"]);
    expect(seen.stuck).toEqual({ line: 3, card: "[repeat]" });
  });

  test("a draw a library calls is stuck at its own card, inside a function the table called", async () => {
    const seen = await runProgram(
      lines(
        "[import(./loop.snap)as(loop)]",
        "",
        "[define{spin}]",
        "[for{i}in][call(range)][num{100}]",
        "  [repeat][num{1000000000}]",
        "    [set{x}to][get{i}]",
        "  [dedent]",
        "[dedent]",
        "",
        "[define{draw}]",
        "[call{spin}]",
      ),
      [],
      { limit: 400 },
    );
    expect(seen.checkErrors).toEqual([]);
    expect(seen.stuck).toEqual({ line: 5, card: "[repeat]" });
  });
});
