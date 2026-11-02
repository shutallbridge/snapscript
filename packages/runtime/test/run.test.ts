// The runtime tracer (#185): a checked program runs, end to end, in a Node host.
import { describe, expect, test } from "vitest";
import { lines, nativeOf, runProgram } from "./helpers.ts";

describe("print", () => {
  test("reaches the host with its card's text position", async () => {
    const seen = await runProgram(lines("[on(load)]", "[call(print)][str{hello_world}]"));
    expect(seen.checkErrors).toEqual([]);
    expect(seen.errors).toEqual([]);
    expect(seen.prints).toEqual([{ text: "hello world", at: { line: 2, card: "[call(print)]" } }]);
  });
});

describe("print shows each value as its card does, separated by spaces", () => {
  test.each([
    ["[num{5}][num{2.5}][num{10}][/][num{4}]", "5 2.5 2.5"],
    ["[num{0.1}][+][num{0.2}]", "0.30000000000000004"],
    ["[str{hello_world}]", "hello world"],
    ["[bool(true)][none]", "true none"],
    ["[color(gold)]", "gold"],
    ["[(][call(list)][num{1}][num{2}][str{a}][)]", '[1, 2, "a"]'],
    ["[num{1}][str{a}][(][call(list)][str{a}][)]", '1 a ["a"]'],
  ])("[call(print)]%s shows %s", async (values, shown) => {
    const seen = await runProgram(lines("[on(load)]", `[call(print)]${values}`));
    expect(seen.checkErrors).toEqual([]);
    expect(seen.prints.map((p) => p.text)).toEqual([shown]);
  });

  test("a dict shows its attributes", async () => {
    const seen = await runProgram(
      lines("[on(load)]", "[set{user}to][call(dict)]", "[get{user}][setProp{message}to][str{hi}]", "[call(print)][get{user}]"),
    );
    expect(seen.prints.map((p) => p.text)).toEqual(['{message: "hi"}']);
  });

  test("a function and a module show their names", async () => {
    const seen = await runProgram(lines("[define{draw}]", "", "[on(load)]", "[call(print)][get{draw}][root]"));
    expect(seen.prints.map((p) => p.text)).toEqual(["<function draw> <module main>"]);
  });
});

describe("native modules", () => {
  test("the native module beside a .snap file sees its extern calls in order, with their values", async () => {
    const seen = await runProgram(
      lines(
        "[import(./shapes.snap)as(shapes)]",
        "",
        "[on(load)]",
        "[call(shapes.fill)][color(gold)]",
        "[call(shapes.circle)][num{1}][num{2}][num{3}]",
        "[call(shapes.circle)][num{4}][num{5}][num{6}]",
      ),
    );
    expect(seen.checkErrors).toEqual([]);
    expect(seen.errors).toEqual([]);
    expect((await nativeOf("shapes.js")).calls).toEqual([
      ["fill", "gold"],
      ["circle", 1, 2, 3],
      ["circle", 4, 5, 6],
    ]);
  });

  test("a native function calls back into the program and sets its module's globals", async () => {
    const seen = await runProgram(
      lines(
        "[import(./loop.snap)as(loop)]",
        "",
        "[define{setup}]",
        "[call(print)][str{setup}]",
        "",
        "[define{draw}]",
        "[call(loop.bump)]",
        "[call(print)][get{loop.count}]",
      ),
    );
    expect(seen.checkErrors).toEqual([]);
    expect(seen.errors).toEqual([]);
    expect(seen.prints).toEqual([
      { text: "setup", at: { line: 4, card: "[call(print)]" } },
      { text: "1", at: { line: 8, card: "[call(print)]" } },
      { text: "2", at: { line: 8, card: "[call(print)]" } },
      { text: "3", at: { line: 8, card: "[call(print)]" } },
    ]);
    expect(seen.frames).toBe(3);
    expect((await nativeOf("loop.js")).calls).toEqual([["run"], ["bump"], ["bump"], ["bump"]]);
  });
});

describe("[on(load)]", () => {
  test("handlers run in import order, an imported module's first, each module once", async () => {
    const text = lines(
      "[import(./outer.snap)as(outer)]",
      "[import(./inner.snap)as(inner)]",
      "",
      "[on(load)]",
      "[call(print)][str{main}]",
    );
    const seen = await runProgram(text);
    expect(seen.checkErrors).toEqual([]);
    expect(seen.prints.map((p) => p.text)).toEqual(["inner", "outer", "main"]);
  });

  test("a library's print has no card on the table", async () => {
    const seen = await runProgram(lines("[import(./inner.snap)as(inner)]"));
    expect(seen.prints).toEqual([{ text: "inner", at: null }]);
  });
});

describe("skipped lines", () => {
  test("a line with an error does not run; the lines around it do", async () => {
    const seen = await runProgram(
      lines(
        "[on(load)]",
        "[call(print)][str{before}]",
        "[call(print)][get{nothing}]",
        "[call(print)][str{after}]",
      ),
    );
    expect(seen.checkErrors).toEqual([{ kind: "NameError", line: 3, message: "nothing is not defined" }]);
    expect(seen.errors).toEqual([]);
    expect(seen.prints.map((p) => p.text)).toEqual(["before", "after"]);
  });

  test("a line the table couldn't read does not run", async () => {
    const text = lines("[on(load)]", "[call(print)][str{before}]", "[call(print)][str{unread}]", "[call(print)][str{after}]");
    expect((await runProgram(text, [3])).prints.map((p) => p.text)).toEqual(["before", "after"]);
  });

  test("a skipped block head skips its body; a skipped branch skips the rest of its chain", async () => {
    const seen = await runProgram(
      lines(
        "[on(load)]",
        "[repeat][num{2}][num{3}]",
        "  [call(print)][str{body}]",
        "[dedent]",
        "[if][bool(false)]",
        "  [call(print)][str{if}]",
        "[elif][bool(true)][>]",
        "  [call(print)][str{elif}]",
        "[else]",
        "  [call(print)][str{else}]",
        "[dedent]",
        "[call(print)][str{done}]",
      ),
    );
    expect(seen.checkErrors.map((e) => [e.kind, e.line])).toEqual([
      ["SyntaxError", 2],
      ["SyntaxError", 7],
    ]);
    expect(seen.prints.map((p) => p.text)).toEqual(["done"]);
  });

  test("a skipped strip does not run", async () => {
    const seen = await runProgram(lines("[define{f}]", "[define{f}]", "", "[on(load)]", "[call(print)][str{load}]"));
    expect(seen.prints.map((p) => p.text)).toEqual(["load"]);
  });
});

describe("statements run as the reference says", () => {
  test("a function takes values and gives its [return] (§8.3)", async () => {
    const text = lines("[define{double}][required{n}]", "[return][get{n}][*][num{2}]", "", "[on(load)]", "[call(print)][call{double}][num{4}]");
    expect((await runProgram(text)).prints.map((p) => p.text)).toEqual(["8"]);
  });

  test("an optional parameter takes its default, or none (§8.3)", async () => {
    const text = lines(
      "[define{greet}][required{message}][optional{title}][str{Mx}][optional{suffix}]",
      "[call(print)][get{title}][+][str{_}][+][get{message}]",
      "[call(print)][get{suffix}]",
      "",
      "[on(load)]",
      "[call{greet}][str{Ada}]",
    );
    expect((await runProgram(text)).prints.map((p) => p.text)).toEqual(["Mx Ada", "none"]);
  });

  test("[set{x}to] sets the global the file declares, and a local otherwise (§4.2)", async () => {
    const text = lines(
      "[global{count}][num{0}]",
      "",
      "[define{bump}]",
      "[set{count}to][get{count}][+][num{1}]",
      "[set{n}to][num{5}]",
      "",
      "[on(load)]",
      "[call{bump}]",
      "[call{bump}]",
      "[call(print)][get{count}]",
    );
    expect((await runProgram(text)).prints.map((p) => p.text)).toEqual(["2"]);
  });

  test("[repeat] runs its body that many times, and [for{…}in] goes through a list (§8.2)", async () => {
    const text = lines(
      "[on(load)]",
      "[repeat][num{3}]",
      "  [call(print)][str{hi}]",
      "[dedent]",
      "[for{i}in][call(range)][num{3}]",
      "  [call(print)][get{i}]",
      "[dedent]",
      "[call(print)][get{i}]",
    );
    expect((await runProgram(text)).prints.map((p) => p.text)).toEqual(["hi", "hi", "hi", "0", "1", "2", "2"]);
  });

  test("the first branch whose value counts as true runs (§8.1)", async () => {
    const branches = (score: number) =>
      lines(
        "[on(load)]",
        `[set{score}to][num{${score}}]`,
        "[if][get{score}][>][num{10}]",
        "  [call(print)][str{win}]",
        "[elif][get{score}][>][num{5}]",
        "  [call(print)][str{close}]",
        "[else]",
        "  [call(print)][str{lose}]",
        "[dedent]",
      );
    expect((await runProgram(branches(11))).prints.map((p) => p.text)).toEqual(["win"]);
    expect((await runProgram(branches(6))).prints.map((p) => p.text)).toEqual(["close"]);
    expect((await runProgram(branches(1))).prints.map((p) => p.text)).toEqual(["lose"]);
  });

  test("[and] and [or] give the value that decided (§6.3)", async () => {
    const text = lines("[on(load)]", "[set{name}to][str{}]", "[call(print)][get{name}][or][str{anon}]", "[call(print)][num{0}][and][num{1}]");
    expect((await runProgram(text)).prints.map((p) => p.text)).toEqual(["anon", "0"]);
  });

  test("names ignore case (§2.1)", async () => {
    const text = lines("[define{drawCircle}]", "[call(print)][str{drawn}]", "", "[on(load)]", "[set{frameCount}to][num{1}]", "[call{drawcircle}]", "[call(print)][get{FRAMECOUNT}]");
    expect((await runProgram(text)).prints.map((p) => p.text)).toEqual(["drawn", "1"]);
  });

  test("a list's methods (§3.3)", async () => {
    const text = lines(
      "[on(load)]",
      "[set{scores}to][call(list)][num{10}][num{20}][num{30}]",
      "[call(print)][get{scores}][call(getAt)][num{-1}]",
      "[get{scores}][call(append)][num{40}]",
      "[call(print)][get{scores}][call(pop)]",
      "[call(print)][call(len)][get{scores}]",
    );
    expect((await runProgram(text)).prints.map((p) => p.text)).toEqual(["30", "40", "3"]);
  });
});
